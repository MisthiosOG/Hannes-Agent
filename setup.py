"""
setup.py — build entry point for Hannes-Agent.

Hannes is distributed via the shell installer, Docker image, or Nix, and
optionally via PyPI (``pip install hannes``).  A PyPI wheel must carry the
bundled assets (skills, locales, TUI bundle) or the installed CLI is broken —
see pyproject.toml's ``[tool.setuptools.package-data]`` for what ships.

The historical guard (which hard-refused wheel/sdist builds outside Nix) was
removed in the PyPI cutover: the wheel now bundles ``hermes_cli/tui_dist`` and
the asset package data, so building is safe.  Nix builds set
``HERMES_NIX_BUILD=1`` and are unaffected.  The only remaining constraint is
that a **bare ``setup.py`` run** (not via the PEP 517 backend) refuses to
build — the backend is what CI/pip actually use.
"""

import os

from setuptools import setup
from setuptools.command.sdist import sdist

_IN_NIX_BUILD = os.environ.get("HERMES_NIX_BUILD") == "1"

# Only refuse a *direct* `python setup.py sdist` invocation (the legacy path,
# never used by pip/uv or CI).  PEP 517 backend hooks (build_wheel /
# build_sdist) always succeed so ``uv build`` / ``pip wheel`` work.
_BLOCK_MESSAGE = (
    "Direct `python setup.py sdist` is not a supported build path.\n"
    "Use the PEP 517 backend instead (uv build / pip wheel / python -m build).\n"
    "See: https://github.com/MisthiosOG/HannesAgent\n"
)


class _GuardedSdist(sdist):
    def run(self, *args, **kwargs):
        if not _IN_NIX_BUILD and os.environ.get("HERMES_ALLOW_DIRECT_SDIST") != "1":
            raise RuntimeError(_BLOCK_MESSAGE)
        return super().run(*args, **kwargs)


cmdclass = {"sdist": _GuardedSdist}

# Keep the wheel cmdclass wired (harmless) but never block it — PyPI publishing
# and pip/uv builds both go through the PEP 517 backend, which must succeed.
try:
    from setuptools.command.bdist_wheel import bdist_wheel

    class _BdistWheel(bdist_wheel):
        def run(self, *args, **kwargs):
            return super().run(*args, **kwargs)

    cmdclass["bdist_wheel"] = _BdistWheel
except ImportError:
    pass

setup(cmdclass=cmdclass)
