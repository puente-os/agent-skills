#!/usr/bin/env python3
"""Validate the public Puente skills tree and native plugin manifests."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
LEGACY_SKILL_DIRS = (ROOT / ".agents" / "skills", ROOT / ".claude" / "skills")
CODEX_MARKETPLACE = ROOT / ".agents" / "plugins" / "marketplace.json"
CLAUDE_MARKETPLACE = ROOT / ".claude-plugin" / "marketplace.json"
CODEX_MANIFEST = ROOT / ".codex-plugin" / "plugin.json"
CLAUDE_MANIFEST = ROOT / ".claude-plugin" / "plugin.json"
SKILLS_DIR = ROOT / "skills"
EXPECTED_SKILLS = {"manage-puente-workflows", "puente-studio"}
CASE_SENSITIVE_FILES = (
    CODEX_MARKETPLACE,
    CODEX_MANIFEST,
    CLAUDE_MANIFEST,
    ROOT / "README.md",
)


def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"{path.relative_to(ROOT)}: {error}") from error


def validate() -> list[str]:
    errors: list[str] = []

    for path in LEGACY_SKILL_DIRS:
        if path.exists():
            errors.append(f"Remove legacy duplicated skill directory: {path.relative_to(ROOT)}")

    for path in CASE_SENSITIVE_FILES:
        if "Puente-OS" in path.read_text(encoding="utf-8"):
            errors.append(f"{path.relative_to(ROOT)} must use the canonical owner 'puente-os'")

    try:
        codex_marketplace = load_json(CODEX_MARKETPLACE)
        claude_marketplace = load_json(CLAUDE_MARKETPLACE)
        codex_manifest = load_json(CODEX_MANIFEST)
        claude_manifest = load_json(CLAUDE_MANIFEST)
    except ValueError as error:
        return [str(error)]

    plugin_name = "puente-os"
    marketplace_name = "skills"
    repository_url = "https://github.com/puente-os/agent-skills"

    for client, manifest in (("Codex", codex_manifest), ("Claude", claude_manifest)):
        if manifest.get("name") != plugin_name:
            errors.append(f"{client} plugin name must be '{plugin_name}'")
        if manifest.get("repository") != repository_url:
            errors.append(f"{client} repository URL must be '{repository_url}'")

    if codex_manifest.get("version") != claude_manifest.get("version"):
        errors.append("Claude and Codex plugin versions must match")
    if codex_manifest.get("skills") != "./skills/":
        errors.append("Codex manifest must load the canonical ./skills/ directory")

    if codex_marketplace.get("name") != marketplace_name:
        errors.append("Codex marketplace name must be 'skills'")
    if claude_marketplace.get("name") != marketplace_name:
        errors.append("Claude marketplace name must be 'skills'")

    codex_plugins = codex_marketplace.get("plugins", [])
    if len(codex_plugins) != 1 or codex_plugins[0].get("name") != plugin_name:
        errors.append("Codex marketplace must contain the puente-os plugin")
    else:
        source = codex_plugins[0].get("source", {})
        if source.get("url") != f"{repository_url}.git" or source.get("ref") != "main":
            errors.append("Codex marketplace source must point to agent-skills main")

    claude_plugins = claude_marketplace.get("plugins", [])
    if len(claude_plugins) != 1 or claude_plugins[0].get("name") != plugin_name:
        errors.append("Claude marketplace must contain the puente-os plugin")
    elif claude_plugins[0].get("source") != "./":
        errors.append("Claude marketplace plugin source must be the repository root")

    skill_files = sorted(SKILLS_DIR.glob("*/SKILL.md"))
    skill_names = {path.parent.name for path in skill_files}
    if skill_names != EXPECTED_SKILLS:
        errors.append(f"Canonical skill set must be {sorted(EXPECTED_SKILLS)}")

    name_pattern = re.compile(r"^name:\s*([^\s]+)\s*$", re.MULTILINE)
    for skill_file in skill_files:
        content = skill_file.read_text(encoding="utf-8")
        match = name_pattern.search(content)
        expected_name = skill_file.parent.name
        if not match:
            errors.append(f"{skill_file.relative_to(ROOT)} has no frontmatter name")
        elif match.group(1) != expected_name:
            errors.append(
                f"{skill_file.relative_to(ROOT)} name must match directory '{expected_name}'"
            )

    helper_dir = SKILLS_DIR / "puente-studio" / "scripts"
    for helper in ("files_to_json.js", "pull_artefacto.js"):
        if not (helper_dir / helper).is_file():
            errors.append(f"Missing bundled helper: skills/puente-studio/scripts/{helper}")

    forbidden_references = ("puente_studio_repo/.env", "node app/files_to_json.js", "node app/pull_artefacto.js")
    for path in SKILLS_DIR.rglob("*"):
        if not path.is_file():
            continue
        content = path.read_text(encoding="utf-8")
        for reference in forbidden_references:
            if reference in content:
                errors.append(f"{path.relative_to(ROOT)} contains stale reference: {reference}")

    return errors


def main() -> int:
    errors = validate()
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("Puente public plugin manifests and canonical skills tree are valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
