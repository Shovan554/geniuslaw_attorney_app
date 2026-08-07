"""Parse service_type_values.val* text blobs into structured step lists.

Each blob looks like:
    intake_steps = { "welcome_email": "Welcome Email", "intro_call": "Intro Call" }

Labels may contain commas inside quotes, so we use ast.literal_eval rather
than splitting by comma. literal_eval only evaluates Python literals — it
does not execute arbitrary code.
"""

from __future__ import annotations

import ast
import re
from typing import List, Optional, Tuple

_GROUP_RE = re.compile(r"^\s*(\w+)\s*=\s*(\{.*\})\s*$", re.DOTALL)


def parse_step_blob(blob: Optional[str]) -> Optional[Tuple[str, List[Tuple[str, str]]]]:
    """Parse one val* blob.

    Returns (group_key, [(step_key, step_label), ...]) or None if empty or
    unparseable. Order of items in the returned list follows insertion order
    of the source dict (Python 3.7+ preserves this for dict literals).
    """
    if not blob or not blob.strip():
        return None
    m = _GROUP_RE.match(blob)
    if not m:
        return None
    group_key, dict_src = m.group(1), m.group(2)
    try:
        parsed = ast.literal_eval(dict_src)
    except (ValueError, SyntaxError):
        return None
    if not isinstance(parsed, dict):
        return None
    return group_key, [(str(k), str(v)) for k, v in parsed.items()]
