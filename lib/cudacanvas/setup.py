from setuptools import setup
import os
import sys
from torch.utils.cpp_extension import BuildExtension, CUDAExtension
import torch

cwd = os.path.dirname(os.path.abspath(__file__))
include_path = None
lib_path = None

if sys.platform.startswith("linux"):
    glfw_libraries = ["glfw", "GL"]
elif sys.platform.startswith("win"):
    glfw_libraries = ["glfw3dll", "opengl32"]
else:
    raise Exception("Unsupported platform.") # TODO pick a more specific exception type

if "INCLUDE_PATH" in os.environ:
    include_path = os.environ["INCLUDE_PATH"]

if "LIB_PATH" in os.environ:
    lib_path = os.environ["LIB_PATH"]

if include_path is None or lib_path is None:
    raise Exception("INCLUDE_PATH and LIB_PATH must be set.")

ext_modules = [
    CUDAExtension(
        "cudacanvas.cudacanvas_cpp",
        ["cudacanvas/cudacanvas.cpp"],
        include_dirs=[include_path],
        library_dirs=[lib_path],
        libraries=glfw_libraries,
        language="c++"
    )
]

setup(
    name="cudacanvas",
    packages=["cudacanvas"],
    ext_modules=ext_modules,
    cmdclass={
        "build_ext": BuildExtension
    },
    install_requires=["glfw"]
)

