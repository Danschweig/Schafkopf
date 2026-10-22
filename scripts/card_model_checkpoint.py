# SPDX-License-Identifier: AGPL-3.0-only
"""Restricted loading of the pinned model and locally produced training states."""
import importlib
import numpy as np
import torch

TRAINING_TYPES = {
    "ultralytics.utils.loss.BboxLoss",
    "ultralytics.utils.loss.DFLoss",
    "ultralytics.utils.loss.v8DetectionLoss",
    "ultralytics.utils.tal.TaskAlignedAssigner",
    "ultralytics.utils.IterableSimpleNamespace",
}

def load_checkpoint(path):
    allowed=[np.dtype,type(np.dtype("float64")),type(np.dtype("float32")),type(np.dtype("int64"))]
    # NumPy scalar construction is needed for the saved numeric training metrics.
    allowed.append(importlib.import_module("numpy._core.multiarray").scalar)
    for qualified in torch.serialization.get_unsafe_globals_in_checkpoint(path):
        if qualified in {"numpy.dtype","numpy._core.multiarray.scalar"}:
            continue
        if qualified=="builtins.set":
            allowed.append(set);continue
        if not qualified.startswith(("torch.nn.modules.","ultralytics.nn.")) and qualified not in TRAINING_TYPES:
            raise ValueError(f"Unexpected pickle global: {qualified}")
        module,name=qualified.rsplit(".",1)
        layer=getattr(importlib.import_module(module),name)
        if not isinstance(layer,type):
            raise ValueError(f"Non-class pickle global: {qualified}")
        allowed.append(layer)
    with torch.serialization.safe_globals(allowed):
        return torch.load(path,map_location="cpu",weights_only=True)
