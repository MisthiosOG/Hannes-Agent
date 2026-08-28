"""The `hannes-agent` skill is what a running Hannes knows about itself.

Skills are synced into `$HERMES_HOME/skills/`, so this file is the agent's
self-knowledge. These tests keep its routing honest: every file the skill
points at must exist, and every reference on disk must be pointed at —
otherwise content exists but the agent never thinks to open it.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SKILL_DIR = REPO / "skills" / "autonomous-ai-agents" / "hannes-agent"
SKILL_MD = SKILL_DIR / "SKILL.md"


@pytest.fixture(scope="module")
def skill_text() -> str:
    return SKILL_MD.read_text(encoding="utf-8")


def test_every_referenced_file_exists(skill_text):
    """Routing a question to a file that isn't there is a dead end."""
    targets = set(re.findall(r"`((?:references|templates)/[^`]+)`", skill_text))

    assert targets, "the skill's routing table no longer references any files"
    for target in sorted(targets):
        assert (SKILL_DIR / target).exists(), f"SKILL.md routes to missing {target}"


def test_every_reference_is_reachable_from_the_skill(skill_text):
    """An unrouted reference is one the agent will never think to open."""
    on_disk = {f"references/{path.name}" for path in (SKILL_DIR / "references").glob("*.md")}
    routed = set(re.findall(r"`(references/[^`]+)`", skill_text))

    assert not (on_disk - routed), (
        f"reference files no reader will ever reach: {sorted(on_disk - routed)} — "
        "add a routing-table row in SKILL.md"
    )


def test_identity_is_hannes_not_upstream(skill_text):
    """The agent answers 'who are you' from this file — keep it on-message."""
    assert "Dopamine" in skill_text
    assert "How Hannes differs from upstream Hermes" in skill_text
    assert "created by Nous Research" not in skill_text
    assert "https://hermes-agent.nousresearch.com/docs" not in skill_text
