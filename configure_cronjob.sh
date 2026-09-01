#!/usr/bin/env bash
# ==============================================================================
# BSA Screener — Automatic Cronjob Configuration Script
# Schedules 15-minute market data download tasks between 09:16 and 15:00 (Mon-Fri)
# ==============================================================================

set -euo pipefail

# Project directory paths
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="$(which python3)"
LOG_DIR="${PROJECT_DIR}/logs"

# Ensure log directory exists
mkdir -p "${LOG_DIR}"

CRON_COMMENT_HEADER="# BSA Screener Market Data Downloads"

# Check if cron jobs already exist
if crontab -l 2>/dev/null | grep -q "${CRON_COMMENT_HEADER}"; then
    echo "⚠️ BSA Screener cronjobs are already configured in crontab."
    echo "To view existing jobs, run: crontab -l"
    exit 0
fi

# Define cron entries
TEMP_CRON="$(mktemp)"

# Export existing crontab (if any)
crontab -l 2>/dev/null > "${TEMP_CRON}" || true

# Append BSA Screener Cronjobs
cat << EOF >> "${TEMP_CRON}"

${CRON_COMMENT_HEADER}
# NSE Stock Market Data & Technical Analysis Engine (Every 15 mins 09:15-14:45 & 15:00)
0,15,30,45 9-14 * * 1-5 ${PYTHON_BIN} ${PROJECT_DIR}/engine/cli.py --mode download-all >> ${LOG_DIR}/cron_nse.log 2>&1
0 15 * * 1-5           ${PYTHON_BIN} ${PROJECT_DIR}/engine/cli.py --mode download-all >> ${LOG_DIR}/cron_nse.log 2>&1

# NSE Derivatives / Option Chain Data (Every 15 mins 09:16-14:46 & 15:01)
16,31,46 9-14 * * 1-5  ${PYTHON_BIN} ${PROJECT_DIR}/engine/cli.py --mode download-fno >> ${LOG_DIR}/cron_fno.log 2>&1
1 15 * * 1-5           ${PYTHON_BIN} ${PROJECT_DIR}/engine/cli.py --mode download-fno >> ${LOG_DIR}/cron_fno.log 2>&1

# US Stock Market Data — US Regular Trading Hours (9:30 AM - 4:00 PM EST => 19:00 PM - 02:30 AM IST)
# Evening Segment: 19:00 to 23:45 IST (Mon-Fri)
0,15,30,45 19-23 * * 1-5 ${PYTHON_BIN} ${PROJECT_DIR}/engine/downloaders/us_market_data.py >> ${LOG_DIR}/cron_us.log 2>&1
# Overnight Segment: 00:00 to 02:30 IST (Tue-Sat in IST => Mon-Fri US trading session)
0,15,30,45 0-2 * * 2-6   ${PYTHON_BIN} ${PROJECT_DIR}/engine/downloaders/us_market_data.py >> ${LOG_DIR}/cron_us.log 2>&1
EOF

# Install updated crontab
crontab "${TEMP_CRON}"
rm -f "${TEMP_CRON}"

echo "✅ Successfully configured BSA Screener market download cronjobs!"
echo "📋 Active crontab schedule:"
crontab -l | grep -A 10 "${CRON_COMMENT_HEADER}"
