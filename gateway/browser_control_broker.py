# Browser-control broker shim.
#
# The full broker lived in the removed messaging gateway. The TUI's
# browser-control RPC module still imports its constants/helpers, so this
# stub keeps the import chain alive without restoring the gateway.
# ponytail: real broker re-added only if browser control is actually used.

BROWSER_CONTROL_PROTOCOL_VERSION = 1


def browser_control_protocol_supported(version):
    return version == BROWSER_CONTROL_PROTOCOL_VERSION


def filter_browser_control_capabilities(caps):
    return caps
