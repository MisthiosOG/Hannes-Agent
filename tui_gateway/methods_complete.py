"""Completion / model-key / paste JSON-RPC handlers (moved verbatim from server.py).

Handler bodies are byte-identical to their pre-split server.py form; they
are rebound onto server.py's globals at install time — see method_ctx.py.
"""

from .method_ctx import HandlerRegistry

_registry = HandlerRegistry()
method = _registry.method
_profile_scoped = _registry.profile_scoped


@method("paste.collapse")
def _(rid, params: dict) -> dict:
    global _paste_counter
    text = params.get("text", "")
    if not text:
        return _err(rid, 4004, "empty paste")

    _paste_counter += 1
    line_count = text.count("\n") + 1
    paste_dir = _hermes_home / "pastes"
    paste_dir.mkdir(parents=True, exist_ok=True)

    from datetime import datetime

    paste_file = (
        paste_dir / f"paste_{_paste_counter}_{datetime.now().strftime('%H%M%S')}.txt"
    )
    paste_file.write_text(text, encoding="utf-8")

    placeholder = (
        f"[Pasted text #{_paste_counter}: {line_count} lines \u2192 {paste_file}]"
    )
    return _ok(
        rid, {"placeholder": placeholder, "path": str(paste_file), "lines": line_count}
    )


@method("complete.path")
def _(rid, params: dict) -> dict:
    word = params.get("word", "")
    if not word:
        return _ok(rid, {"items": []})

    items: list[dict] = []

    def _profile_mention_items(prefix: str) -> list[dict]:
        """`@<profile>` completions: agent profiles as mentionable names.

        Multi-agent UIs (and the Bot Mode plugin) route `@<profile>` text to
        another agent profile; completing profile names alongside path refs
        makes that discoverable. Bare-word matches only — never for
        `@kind:` directive queries. The primary profile is also offered
        under the 'hermes' alias when no real profile claims that name.
        """
        out: list[dict] = []
        try:
            from hermes_cli.profiles import list_profiles

            seen: set[str] = set()
            for p in list_profiles():
                name = (p.name or "").strip()
                if not name:
                    continue
                seen.add(name.lower())
                desc = (getattr(p, "description", "") or "").strip()
                if name.lower().startswith(prefix.lower()):
                    out.append(
                        {
                            "text": f"@{name}",
                            "display": f"@{name}",
                            "meta": desc or "agent profile",
                        }
                    )
            if "hermes".startswith(prefix.lower()) and "hermes" not in seen:
                out.append(
                    {
                        "text": "@hermes",
                        "display": "@hermes",
                        "meta": "agent profile (primary)",
                    }
                )
        except Exception:
            return []
        return out

    try:
        root = _completion_cwd(params)
        is_context = word.startswith("@")
        query = word[1:] if is_context else word

        if is_context and not query:
            items = [
                {"text": "@diff", "display": "@diff", "meta": "git diff"},
                {"text": "@staged", "display": "@staged", "meta": "staged diff"},
                {"text": "@file:", "display": "@file:", "meta": "attach file"},
                {"text": "@folder:", "display": "@folder:", "meta": "attach folder"},
                {"text": "@url:", "display": "@url:", "meta": "fetch url"},
                {"text": "@git:", "display": "@git:", "meta": "git log"},
            ]
            # Agent profiles are mentionable — list them alongside the
            # directive hints so `@` alone reveals them.
            items.extend(_profile_mention_items(""))
            # Append plugin-registered context reference prefixes
            try:
                from agent.context_references import get_context_reference_providers

                for _pfx, _prov in sorted(get_context_reference_providers().items()):
                    items.append(
                        {
                            "text": f"@{_pfx}:",
                            "display": f"@{_pfx}:",
                            "meta": _prov.description or f"plugin: {_pfx}",
                        }
                    )
            except Exception:
                pass
            return _ok(rid, {"items": items})

        # Plugin context reference autocomplete: `@<prefix>:<query>` where the
        # prefix belongs to a plugin-registered ContextReferenceProvider.
        # Handled before the built-in file/folder branching so the elif/else
        # chain below stays intact for built-in prefixes.
        if is_context and ":" in query:
            _pfx, _, _qval = query.partition(":")
            if _pfx not in {"file", "folder", "url", "git", "diff", "staged"}:
                try:
                    from agent.context_references import (
                        get_context_reference_providers as _gcr,
                    )

                    _prov = _gcr().get(_pfx)
                    if _prov is not None:
                        import asyncio as _asyncio

                        _coro = _prov.autocomplete(_qval, limit=20)
                        try:
                            _loop = _asyncio.get_running_loop()
                        except RuntimeError:
                            _loop = None
                        if _loop and _loop.is_running():
                            import concurrent.futures as _cf

                            with _cf.ThreadPoolExecutor(max_workers=1) as _pool:
                                _ac = _pool.submit(_asyncio.run, _coro).result()
                        else:
                            _ac = _asyncio.run(_coro)
                        items = [
                            {
                                "text": f"@{_pfx}:{it.text}",
                                "display": it.display,
                                "meta": it.meta,
                            }
                            for it in _ac
                        ]
                        return _ok(rid, {"items": items})
                except Exception:
                    pass

        # Accept both `@folder:path` and the bare `@folder` form so the user
        # sees directory listings as soon as they finish typing the keyword,
        # without first accepting the static `@folder:` hint.
        if is_context and query in {"file", "folder"}:
            prefix_tag, path_part = query, ""
        elif is_context and query.startswith(("file:", "folder:")):
            prefix_tag, _, tail = query.partition(":")
            path_part = tail
        else:
            prefix_tag = ""
            path_part = query if is_context else query

        # `@/foo` almost always means "foo, from here" rather than the absolute
        # `/foo`: the `@` already says "this is a path", so the slash reads as a
        # separator people type out of habit. Take the absolute reading only
        # when something is actually there, else drop the slash and resolve
        # relative to the cwd — otherwise `@/Desktop` dead-ends on a directory
        # that exists one level down. Real absolute paths (`@/usr/local`,
        # `@/etc/hosts`) still resolve, since those prefixes do exist.
        if (
            is_context
            and path_part.startswith("/")
            and not path_part.startswith("//")
            and not _abs_completion_prefix_exists(path_part)
        ):
            path_part = path_part.lstrip("/")

        # Fuzzy basename search across the repo when the user types a bare
        # name with no path separator — `@appChrome` surfaces every file
        # whose basename matches, regardless of directory depth. Matches what
        # editors like Cursor / VS Code do for Cmd-P. Path-ish queries (with
        # `/`, `./`, `~/`, `/abs`) fall through to the directory-listing
        # path so explicit navigation intent is preserved.
        if (
            is_context
            and path_part
            and len(path_part.strip()) >= 2
            and "/" not in path_part
            and prefix_tag != "folder"
        ):
            ranked: list[tuple[tuple[int, int], str, str, bool]] = []
            walked_dirs: set[str] = set()
            seen: set[str] = set()
            want_hidden = path_part.startswith(".")

            def _consider(rel: str, name: str, is_dir: bool) -> None:
                if rel in seen or (name.startswith(".") and not want_hidden):
                    return
                rank = _fuzzy_basename_rank(name, path_part)
                if rank is not None:
                    seen.add(rel)
                    ranked.append((rank, rel, name, is_dir))

            # Seed with root's immediate children. `_list_repo_files` is capped
            # at _FUZZY_CACHE_MAX_FILES, and outside a git repo the fallback
            # walk can burn that whole budget on one deep subtree before ever
            # reaching a sibling — which is why `@Desk` in a non-repo $HOME
            # found nothing. One listdir keeps the top level always reachable.
            try:
                for entry in os.listdir(root):
                    if entry not in _FUZZY_FALLBACK_EXCLUDES:
                        _consider(entry, entry, os.path.isdir(os.path.join(root, entry)))
            except OSError:
                pass

            for rel in _list_repo_files(root):
                _consider(rel, os.path.basename(rel), False)

                # Directories are only implied by the file listing, so rank each
                # ancestor too. Without this a bare `@Desktop` finds nothing —
                # a folder with no name-matching file inside it is invisible to
                # a file-only scan, which is the "can't @ a folder by name" bug.
                parent = os.path.dirname(rel)
                while parent and parent not in walked_dirs:
                    walked_dirs.add(parent)
                    _consider(parent, os.path.basename(parent), True)
                    parent = os.path.dirname(parent)

            # Same rank tier: folders first, so `@Desktop` leads with the folder
            # rather than a file that merely fuzzy-matches the same letters.
            ranked.sort(key=lambda r: (r[0], not r[3], len(r[1]), r[1]))
            tag = prefix_tag or "file"
            for _, rel, basename, is_dir in ranked[:30]:
                items.append(
                    {
                        "text": f"@{'folder' if is_dir else tag}:{rel}{'/' if is_dir else ''}",
                        "display": basename + ("/" if is_dir else ""),
                        "meta": "dir" if is_dir else os.path.dirname(rel),
                    }
                )

            # Bare-word `@name` may equally be an agent mention — surface
            # matching profiles ABOVE file hits (there are at most a handful,
            # and a user typing `@tur` for a bot shouldn't have to dig).
            if not prefix_tag:
                items = _profile_mention_items(path_part) + items

            return _ok(rid, {"items": items})

        expanded = _normalize_completion_path(path_part) if path_part else "."
        if expanded == "." or not expanded:
            search_dir, match = ".", ""
        elif expanded.endswith("/"):
            search_dir, match = expanded, ""
        else:
            search_dir = os.path.dirname(expanded) or "."
            match = os.path.basename(expanded)

        search_dir = (
            search_dir if os.path.isabs(search_dir) else os.path.join(root, search_dir)
        )
        if not os.path.isdir(search_dir):
            return _ok(rid, {"items": []})

        want_dir = prefix_tag == "folder"
        match_lower = match.lower()
        for entry in sorted(os.listdir(search_dir)):
            if match and not entry.lower().startswith(match_lower):
                continue
            if is_context and entry in _FUZZY_FALLBACK_EXCLUDES:
                continue
            if is_context and not prefix_tag and entry.startswith("."):
                continue
            full = os.path.join(search_dir, entry)
            is_dir = os.path.isdir(full)
            # Explicit `@folder:` / `@file:` — honour the user's filter.  Skip
            # the opposite kind instead of auto-rewriting the completion tag,
            # which used to defeat the prefix and let `@folder:` list files.
            if prefix_tag and want_dir != is_dir:
                continue
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            suffix = "/" if is_dir else ""

            if is_context and prefix_tag:
                text = f"@{prefix_tag}:{rel}{suffix}"
            elif is_context:
                kind = "folder" if is_dir else "file"
                text = f"@{kind}:{rel}{suffix}"
            elif word.startswith("~"):
                text = "~/" + os.path.relpath(full, os.path.expanduser("~")) + suffix
            elif word.startswith("./"):
                text = "./" + rel + suffix
            else:
                text = rel + suffix

            items.append(
                {
                    "text": text,
                    "display": entry + suffix,
                    "meta": "dir" if is_dir else "",
                }
            )
            if len(items) >= 30:
                break
    except Exception as e:
        return _err(rid, 5021, str(e))

    # Bare-word `@name` (including single characters, which skip the fuzzy
    # branch) may be an agent mention — profiles rank above path entries.
    try:
        if is_context and not prefix_tag and path_part and "/" not in path_part:
            items = _profile_mention_items(path_part) + items
    except Exception:
        pass

    return _ok(rid, {"items": items})


@method("complete.slash")
def _(rid, params: dict) -> dict:
    text = params.get("text", "")
    if not text.startswith("/"):
        return _ok(rid, {"items": []})

    try:
        from hermes_cli.commands import SlashCommandCompleter
        from prompt_toolkit.document import Document
        from prompt_toolkit.formatted_text import to_plain_text

        from agent.skill_commands import get_skill_commands
        from agent.skill_bundles import get_skill_bundles

        completer = SlashCommandCompleter(
            skill_commands_provider=lambda: get_skill_commands(),
            skill_bundles_provider=lambda: get_skill_bundles(),
        )
        doc = Document(text, len(text))

        # Declutter: keep _TUI_HIDDEN commands (and their aliases) out of the
        # palette/autocomplete. They still dispatch when typed manually.
        # Completion text at the command-token stage has NO leading slash
        # (prompt_toolkit emits the remainder), so resolve bare tokens too —
        # but only at command stage, never for argument/subcommand items.
        from hermes_cli.commands import resolve_command as _resolve_cmd

        _command_stage = text.rsplit(" ", 1)[-1].startswith("/")

        def _tui_hidden_completion(comp_text: str) -> bool:
            if not _command_stage:
                return False
            token = comp_text.strip().lstrip("/").split(" ")[0]
            if not token:
                return False
            cmd = _resolve_cmd(token)
            return cmd is not None and cmd.name in _TUI_HIDDEN

        # Skill commands and bundles are the only completions offered for an
        # inline `/skill` reference typed mid-message, so the class has to
        # reach the TUI as data. Derived from the same providers the completer
        # uses — no sniffing the ⚡/▣ meta glyphs, which are display text.
        skill_names = {
            key.lstrip("/").lower()
            for key in (*get_skill_commands(), *get_skill_bundles())
        }
        items = [
            {
                "text": c.text,
                # prompt_toolkit gives us FormattedText (a list of (style,
                # text) tuples) for display/display_meta. Serialize both as
                # plain strings — the TUI's CompletionItem.display contract
                # is a string, and sending the raw list trips Ink's row
                # layout into 1-char truncation of the next column.
                "display": to_plain_text(c.display) if c.display else c.text,
                "meta": to_plain_text(c.display_meta) if c.display_meta else "",
                "kind": (
                    "skill"
                    if c.text.strip().lstrip("/").lower() in skill_names
                    else "command"
                ),
            }
            for c in completer.get_completions(doc, None)
            if not _tui_hidden_completion(c.text)
        ]

        # Rank and bound the list (see _rank_slash_completions) while a
        # `/token` is under the cursor — the one stage skills are offered at.
        # An argument stage (`/personality `, `/details c`) keeps the order
        # its own command chose.
        if text.rsplit(" ", 1)[-1].startswith("/"):
            score_of = None
            # Description-aware fuzzy scoring (ported from grok-cli's slash
            # menu) at the command-token stage: the completer above only
            # emits name-prefix matches, so merge in catalog entries whose
            # name SUBSTRING or DESCRIPTION words match the query — typing
            # `/summary` surfaces a command whose description mentions
            # summaries. Command matches always outrank description matches.
            if " " not in text and len(text) > 1:
                from tui_gateway.slash_fuzzy import (
                    fuzzy_rank_slash_items,
                    normalize_slash_search_query,
                )

                universe = [
                    {
                        "text": c.text,
                        "display": to_plain_text(c.display) if c.display else c.text,
                        "meta": to_plain_text(c.display_meta) if c.display_meta else "",
                        "kind": (
                            "skill"
                            if c.text.strip().lstrip("/").lower() in skill_names
                            else "command"
                        ),
                    }
                    for c in completer.get_completions(Document("/", 1), None)
                    if not _tui_hidden_completion(c.text)
                ]
                items, score_of = fuzzy_rank_slash_items(
                    items, universe, normalize_slash_search_query(text)
                )

            usage, origin_of = _skill_usage_lookup()
            items = _rank_slash_completions(
                items, usage, origin_of, browsing=text == "/", score_of=score_of
            )
        else:
            items = items[:_SLASH_COMPLETION_LIMIT]

        text_lower = text.lower()
        extras = [
            {
                "text": "/density",
                "display": "/density",
                "meta": "Toggle compact display mode",
                "kind": "command",
            },
            {
                "text": "/details",
                "display": "/details",
                "meta": "Control agent detail visibility",
                "kind": "command",
            },
            {
                "text": "/logs",
                "display": "/logs",
                "meta": "Show recent gateway log lines",
                "kind": "command",
            },
            {
                "text": "/mouse",
                "display": "/mouse",
                "meta": "Set mouse tracking preset [on|off|toggle|wheel|buttons|all]",
                "kind": "command",
            },
            {
                "text": "/skins",
                "display": "/skins",
                "meta": "Browse and apply skins",
                "kind": "command",
            },
            {
                "text": "/stats",
                "display": "/stats",
                "meta": "Session + learning stats at a glance",
                "kind": "command",
            },
        ]
        for extra in extras:
            if extra["text"].startswith(text_lower) and not any(
                item["text"] == extra["text"] for item in items
            ):
                items.append(extra)

        details_items = _details_completions(text)
        if details_items is not None:
            return _ok(
                rid,
                {
                    "items": details_items,
                    "replace_from": text.rfind(" ") + 1 if " " in text else len(text),
                },
            )

        return _ok(
            rid,
            {"items": items, "replace_from": text.rfind(" ") + 1 if " " in text else 1},
        )
    except Exception as e:
        return _err(rid, 5020, str(e))


@method("model.options")
def _(rid, params: dict) -> dict:
    try:
        from hermes_cli.inventory import build_model_options_payload

        session = _sessions.get(params.get("session_id", ""))
        agent = session.get("agent") if session else None
        # Layer agent-session state on top of disk config — once an agent
        # is spawned, IT owns the live provider/model/base_url. Empty
        # agent attributes must NOT clobber disk config (with_overrides
        # is truthy-only).
        ctx = _model_picker_context(agent)
        payload = build_model_options_payload(
            ctx,
            explicit_only=bool(params.get("explicit_only")),
            include_unconfigured=bool(params.get("include_unconfigured")),
            refresh=bool(params.get("refresh")),
        )
        return _ok(rid, payload)
    except Exception as e:
        return _err(rid, 5033, str(e))


@method("model.save_key")
def _(rid, params: dict) -> dict:
    """Save an API key for a provider, then return its refreshed model list.

    Params:
        slug: provider slug (e.g. "deepseek", "xai")
        api_key: the key value to save

    Returns the provider dict with models populated (same shape as
    model.options entries) on success.
    """
    try:
        from hermes_cli.auth import PROVIDER_REGISTRY
        from hermes_cli.config import is_managed
        from hermes_cli.inventory import build_models_payload

        slug = (params.get("slug") or "").strip()
        api_key = (params.get("api_key") or "").strip()
        if not slug or not api_key:
            return _err(rid, 4001, "slug and api_key are required")

        if is_managed():
            return _err(rid, 4006, "managed install — credentials are read-only")

        pconfig = PROVIDER_REGISTRY.get(slug)
        if not pconfig:
            return _err(rid, 4002, f"unknown provider: {slug}")
        if pconfig.auth_type != "api_key":
            return _err(
                rid,
                4003,
                f"{pconfig.name} uses {pconfig.auth_type} auth — "
                f"run `hermes model` to configure",
            )
        if not pconfig.api_key_env_vars:
            return _err(rid, 4004, f"no env var defined for {pconfig.name}")

        # Save the key to ~/.hermes/.env via the unified credential lifecycle
        # so any stale config.yaml mirror of the previous key (model.api_key,
        # custom_providers[*].api_key) is rotated in the same action (#62269).
        env_var = pconfig.api_key_env_vars[0]
        from hermes_cli.credential_lifecycle import save_provider_env_credential

        save_provider_env_credential(env_var, api_key)
        # Also set in current process so the refreshed inventory sees it.
        import os

        os.environ[env_var] = api_key

        # Refresh provider data via the shared inventory builder so this
        # surface stays in lock-step with model.options + dashboard
        # /api/model/options. picker_hints=True ensures the returned row
        # carries `authenticated` for the TUI frontend.
        session = _sessions.get(params.get("session_id", ""))
        agent = session.get("agent") if session else None
        ctx = _model_picker_context(agent)
        payload = build_models_payload(
            ctx, picker_hints=True, max_models=50,
        )
        provider_data = next(
            (p for p in payload["providers"] if p["slug"] == slug), None
        )
        if provider_data is None:
            # Key was saved but provider didn't appear — still return success.
            provider_data = {
                "slug": slug,
                "name": pconfig.name,
                "is_current": False,
                "models": [],
                "total_models": 0,
                "authenticated": True,
            }
        # picker_hints sets `authenticated` from the row state, but the
        # synthetic fallback above doesn't go through that path.
        provider_data["authenticated"] = True
        return _ok(rid, {"provider": provider_data})
    except Exception as e:
        return _err(rid, 5034, str(e))


@method("model.disconnect")
def _(rid, params: dict) -> dict:
    """Remove credentials for a provider.

    Params:
        slug: provider slug (e.g. "deepseek", "xai")

    Returns success status and the provider's slug.
    """
    try:
        from hermes_cli.auth import PROVIDER_REGISTRY, clear_provider_auth
        from hermes_cli.credential_lifecycle import remove_provider_env_credential

        slug = (params.get("slug") or "").strip()
        if not slug:
            return _err(rid, 4001, "slug is required")

        pconfig = PROVIDER_REGISTRY.get(slug)
        cleared_env = False
        cleared_auth = False

        # Remove API key env vars from .env and process, plus every mirror
        # (env-seeded credential_pool entries, provider model cache rows,
        # value-matched config.yaml api_key copies) via the unified helper —
        # otherwise the provider resurrects in the picker after restart
        # (#51071 / #59761).
        if pconfig and pconfig.api_key_env_vars:
            for ev in pconfig.api_key_env_vars:
                if remove_provider_env_credential(ev).get("found"):
                    cleared_env = True

        # Clear OAuth / credential pool state. This is a full provider
        # disconnect (TUI "disconnect" action), so removing OAuth grants
        # here is the documented intent — unlike the key-only delete paths.
        cleared_auth = clear_provider_auth(slug)

        if not cleared_env and not cleared_auth:
            return _err(rid, 4005, f"no credentials found for {slug}")

        provider_name = pconfig.name if pconfig else slug
        return _ok(
            rid,
            {
                "slug": slug,
                "name": provider_name,
                "disconnected": True,
            },
        )
    except Exception as e:
        return _err(rid, 5035, str(e))


@method("model.save_custom")
def _(rid, params: dict) -> dict:
    """Save an OpenAI-compatible custom endpoint, auto-fetch its models.

    Params:
        base_url: the endpoint URL (e.g. ``https://api.example.com/v1``)
        api_key: optional API key

    Returns the provider dict (same shape as model.options entries)
    with models populated from the live ``/v1/models`` probe.
    """
    import json
    import os
    import urllib.error
    import urllib.request
    from urllib.parse import urlparse

    base_url = (params.get("base_url") or "").strip().rstrip("/")
    api_key = (params.get("api_key") or "").strip()
    if not base_url:
        return _err(rid, 4001, "base_url is required")

    # Normalize: assume https when no scheme is given, so a bare
    # "b.ai/v1" still resolves instead of failing on a relative URL.
    if "://" not in base_url:
        base_url = f"https://{base_url}"
    base_url = base_url.rstrip("/")

    # 1. Probe /v1/models to auto-discover available models.
    models_url = f"{base_url}/models"
    req = urllib.request.Request(models_url, method="GET")
    # Browser-like headers: many OpenAI-compatible endpoints (Cloudflare /
    # WAF-protected) reject the default Python-urllib User-Agent with a 403.
    req.add_header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36")
    req.add_header("Accept", "application/json")
    if api_key:
        req.add_header("Authorization", f"Bearer {api_key}")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = e.read().decode(errors="replace")[:200]
        except Exception:
            pass
        return _err(
            rid,
            5036,
            f"cannot fetch models from {models_url}: HTTP {e.code} {detail}".strip(),
        )
    except Exception as e:
        return _err(rid, 5036, f"cannot fetch models from {models_url}: {e}")

    raw = body.get("data") or body.get("models") or []
    if not isinstance(raw, list):
        raw = []
    models = sorted(
        {m["id"] for m in raw if isinstance(m, dict) and m.get("id")}
        | {m for m in raw if isinstance(m, str)}
    )
    if not models:
        return _err(rid, 5037, f"no models found at {models_url}")

    # 2. Save to custom_providers in config. Use the hostname as the
    # provider name for readability.
    parsed = urlparse(base_url)
    hostname = parsed.hostname or "custom"
    name = params.get("name") or f"OpenAI Compatible ({hostname})"

    # Stable identity: provider_key drives the resolver slug so
    # `--provider custom:{hostname}` resolves through
    # resolve_custom_provider → custom_provider_slug.
    provider_key = f"custom:{hostname}"
    from hermes_cli.providers import custom_provider_slug

    slug = custom_provider_slug(name, provider_key)

    from hermes_cli.config import load_config, save_config

    cfg = load_config()
    providers = cfg.get("custom_providers") or []
    if not isinstance(providers, list):
        providers = []

    # Deduplicate by base_url
    entry = None
    for e in providers:
        if isinstance(e, dict) and e.get("base_url", "").rstrip("/") == base_url:
            entry = e
            break

    if entry is None:
        entry = {"name": name, "base_url": base_url, "provider_key": provider_key}
        providers.append(entry)
        cfg["custom_providers"] = providers
    else:
        entry["provider_key"] = provider_key
        entry["name"] = name

    # Save API key if provided (to .env via the unified lifecycle).
    if api_key:
        safe_host = hostname.replace(".", "_").replace("-", "_")
        env_var = f"HANNES_CUSTOM_{safe_host.upper()}_API_KEY"
        from hermes_cli.credential_lifecycle import save_provider_env_credential

        try:
            save_provider_env_credential(env_var, api_key)
        except Exception:
            os.environ[env_var] = api_key
        entry["key_env"] = env_var
        if "api_key" in entry:
            del entry["api_key"]
    elif "api_key" in entry:
        entry.pop("api_key", None)

    # Pick first model as default
    entry["model"] = models[0]
    entry["models"] = {m: {} for m in models}

    save_config(cfg)

    # 3. Build provider response matching model.options shape.
    provider_data = {
        "slug": slug,
        "name": name,
        "is_current": False,
        "authenticated": True,
        "models": models,
        "total_models": len(models),
        "base_url": base_url,
    }

    return _ok(rid, {"provider": provider_data})


@method("brain.snapshot")
def _(rid, params: dict) -> dict:
    """Snapshot of what the agent has learned (holographic memory store).

    Params:
        limit: max facts to return (default 60)
        web:   when true, also write an HTML view and return its path

    Returns ``{level, facts_total, skills_tracked, categories, facts,
    entities, html_path}``. Everything is read-only; a missing store yields
    an empty snapshot rather than an error, so ``/brain`` always renders.
    """
    import sqlite3

    limit = params.get("limit")
    try:
        limit = max(1, min(int(limit), 500)) if limit is not None else 60
    except Exception:
        limit = 60
    want_web = bool(params.get("web"))

    from hermes_constants import get_hermes_home

    home = get_hermes_home()
    db = home / "memory_store.db"

    snapshot: dict = {
        "facts_total": 0,
        "level": 1,
        "skills_tracked": 0,
        "categories": [],
        "facts": [],
        "entities": [],
        "html_path": "",
    }

    if db.exists():
        try:
            con = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=2.0)
            con.row_factory = sqlite3.Row
            try:
                total = int(
                    con.execute("SELECT COUNT(*) FROM facts").fetchone()[0] or 0
                )
                snapshot["facts_total"] = total
                snapshot["level"] = total // 20 + 1

                snapshot["categories"] = [
                    {"name": r["category"] or "general", "count": int(r["n"])}
                    for r in con.execute(
                        "SELECT category, COUNT(*) AS n FROM facts "
                        "GROUP BY category ORDER BY n DESC"
                    ).fetchall()
                ]

                snapshot["facts"] = [
                    {
                        "content": r["content"] or "",
                        "category": r["category"] or "general",
                        "trust": float(r["trust_score"] or 0.0),
                        "used": int(r["retrieval_count"] or 0),
                        "created_at": str(r["created_at"] or ""),
                    }
                    for r in con.execute(
                        "SELECT content, category, trust_score, retrieval_count, "
                        "created_at FROM facts ORDER BY trust_score DESC, "
                        "fact_id DESC LIMIT ?",
                        (limit,),
                    ).fetchall()
                ]

                try:
                    snapshot["entities"] = [
                        {"name": r["name"] or "", "count": int(r["n"])}
                        for r in con.execute(
                            "SELECT e.name AS name, COUNT(fe.fact_id) AS n "
                            "FROM entities e "
                            "LEFT JOIN fact_entities fe ON fe.entity_id = e.entity_id "
                            "GROUP BY e.entity_id ORDER BY n DESC LIMIT 40"
                        ).fetchall()
                    ]
                except Exception:
                    snapshot["entities"] = []
            finally:
                con.close()
        except Exception as e:
            return _err(rid, 5040, f"cannot read memory store: {e}")

    try:
        from tools.skill_usage import load_usage

        usage = load_usage() or {}
        snapshot["skills_tracked"] = len(usage) if isinstance(usage, dict) else 0
    except Exception:
        snapshot["skills_tracked"] = 0

    if want_web:
        try:
            import html as _html
            import json as _j

            facts = snapshot.get("facts") or []
            cats = snapshot.get("categories") or []
            ents = snapshot.get("entities") or []

            out = home / "brain.html"
            payload = _j.dumps(
                {
                    "categories": cats,
                    "entities": ents,
                    "facts": facts,
                },
                ensure_ascii=False,
            )
            rows = "\n".join(
                "<tr><td class=cat>{c}</td><td>{t}</td><td class=num>{tr:.2f}</td>"
                "<td class=num>{u}</td></tr>".format(
                    c=_html.escape(str(f.get("category", ""))),
                    t=_html.escape(str(f.get("content", ""))[:400]),
                    tr=float(f.get("trust", 0.0)),
                    u=int(f.get("used", 0)),
                )
                for f in facts
            )
            chips = " ".join(
                "<span class=chip>{n} <b>{c}</b></span>".format(
                    n=_html.escape(str(c.get("name", ""))), c=int(c.get("count", 0))
                )
                for c in cats
            )
            doc = f"""<!doctype html>
<meta charset="utf-8">
<title>Hannes Brain</title>
<style>
:root{{--bg:#0F1412;--fg:#E6F4EC;--mut:#3daa82;--acc:#34D399;--line:#2C3A32;--pan:#151B18}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}}
header{{padding:18px 22px;border-bottom:1px solid var(--line);display:flex;gap:18px;align-items:baseline;flex-wrap:wrap}}
h1{{margin:0;font-size:16px;letter-spacing:.14em;text-transform:uppercase;color:var(--acc)}}
.kpi{{color:var(--mut)}} .kpi b{{color:var(--fg)}}
main{{padding:22px;display:grid;gap:22px;grid-template-columns:1fr;max-width:1200px}}
section{{background:var(--pan);border-left:2px solid var(--acc);padding:14px 16px}}
h2{{margin:0 0 10px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut)}}
.chip{{display:inline-block;background:#1d2622;border:1px solid var(--line);padding:2px 8px;margin:2px 4px 2px 0;color:var(--mut)}}
.chip b{{color:var(--acc)}}
table{{width:100%;border-collapse:collapse}}
td,th{{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}}
th{{color:var(--mut);font-weight:400;font-size:12px;letter-spacing:.1em;text-transform:uppercase}}
.cat{{color:var(--acc);white-space:nowrap}} .num{{color:var(--mut);text-align:right;white-space:nowrap}}
canvas{{width:100%;height:420px;display:block}}
</style>
<header>
  <h1>Hannes Brain</h1>
  <span class="kpi">level <b>{snapshot['level']}</b></span>
  <span class="kpi">facts <b>{snapshot['facts_total']}</b></span>
  <span class="kpi">skills <b>{snapshot['skills_tracked']}</b></span>
  <span class="kpi">entities <b>{len(ents)}</b></span>
</header>
<main>
  <section><h2>Entity map</h2><canvas id="g"></canvas></section>
  <section><h2>Categories</h2>{chips or '<span class=chip>none</span>'}</section>
  <section><h2>Facts</h2>
    <table><tr><th>category</th><th>content</th><th>trust</th><th>used</th></tr>
    {rows or '<tr><td colspan=4>nothing learned yet</td></tr>'}</table>
  </section>
</main>
<script>
const DATA = {payload};
const cv = document.getElementById('g'), cx = cv.getContext('2d');
function draw() {{
  const w = cv.width = cv.clientWidth * devicePixelRatio;
  const h = cv.height = cv.clientHeight * devicePixelRatio;
  cx.clearRect(0, 0, w, h);
  const ns = DATA.entities.slice(0, 40);
  if (!ns.length) {{
    cx.fillStyle = '#3daa82';
    cx.font = (13 * devicePixelRatio) + 'px monospace';
    cx.fillText('no entities yet', 14 * devicePixelRatio, 26 * devicePixelRatio);
    return;
  }}
  const cxc = w / 2, cyc = h / 2, R = Math.min(w, h) * 0.36;
  const max = Math.max(...ns.map(n => n.count), 1);
  const pts = ns.map((n, i) => {{
    const a = (i / ns.length) * Math.PI * 2 - Math.PI / 2;
    return {{ x: cxc + Math.cos(a) * R, y: cyc + Math.sin(a) * R, n }};
  }});
  cx.strokeStyle = 'rgba(52,211,153,0.16)';
  cx.lineWidth = devicePixelRatio;
  pts.forEach(p => {{ cx.beginPath(); cx.moveTo(cxc, cyc); cx.lineTo(p.x, p.y); cx.stroke(); }});
  cx.fillStyle = '#34D399';
  cx.beginPath(); cx.arc(cxc, cyc, 6 * devicePixelRatio, 0, Math.PI * 2); cx.fill();
  cx.font = (11 * devicePixelRatio) + 'px monospace';
  pts.forEach(p => {{
    const r = (4 + 7 * (p.n.count / max)) * devicePixelRatio;
    cx.fillStyle = '#6EE7B7';
    cx.beginPath(); cx.arc(p.x, p.y, r, 0, Math.PI * 2); cx.fill();
    cx.fillStyle = '#E6F4EC';
    cx.fillText(p.n.name.slice(0, 18), p.x + r + 4 * devicePixelRatio, p.y + 4 * devicePixelRatio);
  }});
}}
addEventListener('resize', draw); draw();
</script>"""
            out.write_text(doc, encoding="utf-8")
            snapshot["html_path"] = str(out)
        except Exception as e:
            return _err(rid, 5041, f"cannot write brain view: {e}")

    return _ok(rid, snapshot)


def register(server) -> None:
    """Bind this module's handlers onto ``server``'s globals and registry."""
    _registry.install(server)
