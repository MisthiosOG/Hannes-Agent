# Legacy Relay-plugin cutover helpers — no-op shim.
#
# The messaging Relay (gateway) was removed from Hannes; no Relay plugins
# exist anymore, so nothing is ever "stale" and nothing is refused. Kept as
# a module so plugins.py can keep its import.

RELAY_PLUGINS_CONFIG_ENV = "HERMES_RELAY_PLUGINS_CONFIG"
LEGACY_RELAY_PLUGIN_KEYS = frozenset()


def legacy_relay_plugin_keys(enabled):
    return []


def configured_legacy_relay_env_vars(environ):
    # Messaging Relay removed from Hannes; no legacy exporter vars are
    # recognized anymore.
    return []
