"""Settings a deployment may override through environment variables."""

import os

CONSUMER_POLLING = int(os.environ.get("CONSUMER_POLLING", "0"))
