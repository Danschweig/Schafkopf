import sys
from pathlib import Path
import unittest
import tempfile
import json
import os
from unittest import mock
from importlib.util import module_from_spec, spec_from_file_location
import cv2
import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/"scripts"))
from card_index_reader import CardIndexReader, prepare_patch, tensor_image, augment, RANKS, SUITS, TARGET, digest, audit_dataset


def trainer_module():
    spec = spec_from_file_location("reader_training_recovery_test", Path(__file__).resolve().parents[1]/"scripts/run-card-index-reader-training.py")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class IndexReaderTests(unittest.TestCase):
    def test_status_retries_locks_and_preserves_previous_json_if_lock_persists(self):
        training = trainer_module()
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary)/"status.json"
            path.write_text('{"epoch": 1}', encoding="utf-8")
            replace = training.os.replace
            calls = []

            def transient(source, destination):
                calls.append(1)
                if len(calls) < 3:
                    raise PermissionError("Windows sharing violation")
                replace(source, destination)

            with mock.patch.object(training.os, "replace", side_effect=transient), mock.patch.object(training.time, "sleep"):
                self.assertTrue(training.write_progress(path, {"epoch": 2}))
            self.assertEqual(len(calls), 3)
            self.assertEqual(json.loads(path.read_text())["epoch"], 2)
            with mock.patch.object(training.os, "replace", side_effect=PermissionError("locked")), mock.patch.object(training.time, "sleep"):
                self.assertFalse(training.write_progress(path, {"epoch": 3}, attempts=2))
            self.assertEqual(json.loads(path.read_text())["epoch"], 2)
            self.assertTrue(training.write_progress(path, {"epoch": 4}))
            self.assertEqual(json.loads(path.read_text())["epoch"], 4)

    @unittest.skipUnless(os.name == "nt", "Windows file sharing regression")
    def test_actual_windows_read_handle_cannot_abort_status_updates(self):
        import ctypes
        from ctypes import wintypes
        training = trainer_module()
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        create = kernel.CreateFileW
        create.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p]
        create.restype = wintypes.HANDLE
        close = kernel.CloseHandle
        close.argtypes = [wintypes.HANDLE]
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary)/"status.json"
            path.write_text('{"epoch": 0}', encoding="utf-8")
            # The writer must survive old readers and permissive new readers.
            # Some Windows file-system filters still deny replacement with
            # ShareDelete; in that case defer telemetry until the handle closes.
            for share in [3, 7]:
                previous = path.read_text()
                handle = create(str(path), 0x80000000, share, None, 3, 0, None)
                self.assertNotEqual(handle, ctypes.c_void_p(-1).value)
                try:
                    with mock.patch.object(training.time, "sleep"):
                        written = training.write_progress(path, {"epoch": share}, attempts=2)
                    if not written:
                        self.assertEqual(path.read_text(), previous)
                finally:
                    close(handle)
                self.assertTrue(training.write_progress(path, {"epoch": share}))
            self.assertEqual(json.loads(path.read_text())["epoch"], 7)

    def test_warm_start_reuses_weights_and_rejects_a_different_dataset(self):
        training = trainer_module()
        model = CardIndexReader()
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            checkpoint = folder/"best.pt"
            torch.save({"state_dict": model.state_dict(), "epoch": 17, "architecture": model.architecture,
                        "target": TARGET, "ranks": RANKS, "suits": SUITS}, checkpoint)
            (folder/"config.json").write_text(json.dumps({"manifestSha256": "same-dataset"}), encoding="utf-8")
            restored = CardIndexReader()
            loaded = training.load_warm_start(restored, checkpoint, "same-dataset")
            self.assertEqual(loaded["epoch"], 17)
            for key, value in model.state_dict().items():
                self.assertTrue(torch.equal(restored.state_dict()[key], value))
            with self.assertRaisesRegex(ValueError, "do not match"):
                training.load_warm_start(restored, checkpoint, "other-dataset")

    def test_letterboxing_preserves_aspect_and_rgb_channels(self):
        patch = np.zeros((40, 20, 3), np.uint8)
        patch[:, :, 2] = 255
        rgb = prepare_patch(patch)
        self.assertEqual(rgb.shape, (96, 96, 3))
        self.assertTrue(np.all(rgb[:, :24] == 255))
        self.assertTrue(np.all(rgb[30, 40] == [255, 0, 0]))
        self.assertEqual(tensor_image(rgb).shape, (3, 96, 96))

    def test_rank_cannot_use_colour_when_luminance_is_identical(self):
        torch.manual_seed(123)
        model = CardIndexReader().eval()
        first = torch.full((1, 3, 96, 96), .4)
        second = first.clone()
        second[:, 0] += .1
        second[:, 1] -= .1*.299/.587
        with torch.inference_mode():
            rank_a, suit_a = model(first)
            rank_b, suit_b = model(second)
        self.assertTrue(torch.allclose(rank_a, rank_b, atol=1e-6))
        self.assertFalse(torch.allclose(suit_a, suit_b, atol=1e-7))
        self.assertEqual(rank_a.shape, (1, len(RANKS)))
        self.assertEqual(suit_a.shape, (1, len(SUITS)))

    def test_input_order_does_not_change_classification(self):
        torch.manual_seed(456)
        model = CardIndexReader().eval()
        images = torch.rand(2, 3, 96, 96)
        with torch.inference_mode():
            rank, suit = model(images)
            reversed_rank, reversed_suit = model(images.flip(0))
        self.assertTrue(torch.allclose(rank, reversed_rank.flip(0), atol=1e-6))
        self.assertTrue(torch.allclose(suit, reversed_suit.flip(0), atol=1e-6))

    def test_v2_rank_is_invariant_to_uniform_lighting_offsets(self):
        torch.manual_seed(911)
        model = CardIndexReader().eval()
        image = .2+.3*torch.rand(2, 3, 96, 96)
        with torch.inference_mode():
            first, _ = model(image)
            brighter, _ = model(image+.1)
        self.assertTrue(torch.allclose(first, brighter, atol=1e-5))

    def test_metrics_do_not_hide_suit_errors_behind_unlabelled_or_blank_samples(self):
        spec = spec_from_file_location("reader_training_test", Path(__file__).resolve().parents[1]/"scripts/run-card-index-reader-training.py")
        training = module_from_spec(spec)
        spec.loader.exec_module(training)

        class Predictions(torch.nn.Module):
            def forward(self, images):
                return images[:, :9, 0, 0], images[:, 9:, 0, 0]

        images = torch.zeros(4, 14, 1, 1)
        for index, (rank, suit) in enumerate([(0, 4), (1, 1), (3, 0), (8, 4)]):
            images[index, rank, 0, 0] = 10
            images[index, 9+suit, 0, 0] = 10
        metrics = training.validate(Predictions(), [(images, torch.tensor([0, 1, 2, 8]), torch.tensor([0, 1, -100, 4]),
                                                    ["photographed-index", "photographed-index", "rendered-index", "blank"])])
        self.assertEqual(metrics["rankAccuracy"], .75)
        self.assertEqual(metrics["suitExamples"], 3)
        self.assertEqual(metrics["suitAccuracy"], 2/3)
        self.assertEqual(metrics["knownSuitAccuracy"], .5)
        self.assertEqual(metrics["referenceRankAccuracy"], 1.)
        self.assertEqual(metrics["referenceJointAccuracy"], .5)
        self.assertEqual(metrics["rankConfusion"][2][3], 1)

    def test_crop_augmentation_is_seeded_and_rejects_empty_photos(self):
        patch = np.full((96, 96, 3), 220, np.uint8)
        a = augment(patch, np.random.default_rng(42))
        b = augment(patch, np.random.default_rng(42))
        self.assertTrue(np.array_equal(a, b))
        for invalid in [None, np.zeros((0, 2, 3), np.uint8), np.zeros((20, 20), np.uint8)]:
            with self.assertRaises(ValueError):
                prepare_patch(invalid)

    def test_dataset_audit_rejects_group_leakage_and_modified_prepared_images(self):
        with tempfile.TemporaryDirectory(prefix="schafkopf-index-reader-") as temporary:
            folder = Path(temporary)
            source = folder/"generator.txt"
            source.write_text("fixture", encoding="utf-8")
            manifest = {"target": TARGET, "ranks": RANKS, "suits": SUITS,
                        "sources": [{"kind": "generator", "file": str(source), "sha256": digest(source), "group": split} for split in ["train", "val"]], "samples": []}
            rng = np.random.default_rng(17)
            for split in ["train", "val"]:
                for rank in range(9):
                    file = folder/f"{split}-{rank}.png"
                    cv2.imwrite(str(file), rng.integers(0, 255, (96, 96, 3), dtype=np.uint8))
                    manifest["samples"].append({"file": file.name, "sha256": digest(file), "split": split, "rank": rank, "suit": rank%5, "suitSupervised": True, "group": split, "sourceSha256": digest(source)})
            path = folder/"manifest.json"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            _, report = audit_dataset(folder)
            self.assertEqual(report["counts"]["train"]["samples"], 9)
            manifest["samples"][-1]["group"] = "train"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "crosses training"):
                audit_dataset(folder)
            manifest["samples"][-1]["group"] = "val"
            path.write_text(json.dumps(manifest), encoding="utf-8")
            (folder/manifest["samples"][0]["file"]).write_bytes(b"changed")
            with self.assertRaisesRegex(ValueError, "Prepared image changed"):
                audit_dataset(folder)


if __name__ == "__main__":
    torch.set_num_threads(2)
    unittest.main()
