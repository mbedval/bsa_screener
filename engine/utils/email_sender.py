import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from engine.utils.helpers import get_system_config

logger = logging.getLogger("bsa_email_sender")

def send_email_with_attachment(
    subject: str,
    body: str,
    attachment_paths: list[str],
    custom_recipients: list[str] = None,
    return_detail: bool = False
):
    """
    Sends an email using SMTP credentials from PostgreSQL `system_config` table or environment variables.
    Supports configurable SMTP host, port, SSL/TLS options.
    """
    gmail_user = (
        get_system_config("gmail_user")
        or get_system_config("smtp_user")
        or os.getenv("GMAIL_USER")
        or os.getenv("SMTP_USER")
    )
    gmail_password = (
        get_system_config("gmail_app_password")
        or get_system_config("smtp_password")
        or os.getenv("GMAIL_APP_PASSWORD")
        or os.getenv("SMTP_PASSWORD")
    )

    if not gmail_user or not gmail_password:
        err_msg = "Missing SMTP credentials (gmail_user / gmail_app_password or SMTP_USER / SMTP_PASSWORD) in system_config or environment variables."
        logger.error(err_msg)
        return (False, err_msg) if return_detail else False

    default_email = (
        get_system_config("default_email")
        or os.getenv("DEFAULT_EMAIL")
        or ""
    ).strip()

    recipients = [r for r in (custom_recipients or ([default_email] if default_email else [gmail_user])) if r]
    if not recipients:
        err_msg = "No email recipients provided."
        logger.error(err_msg)
        return (False, err_msg) if return_detail else False

    # CC setup: Always include default_email as CC if configured and not already in main recipients
    cc_recipients = []
    if default_email and default_email not in recipients:
        cc_recipients.append(default_email)

    # All envelope recipients for SMTP delivery (TO + CC)
    envelope_recipients = list(dict.fromkeys(recipients + cc_recipients))

    # Set up the MIME message
    msg = MIMEMultipart()
    msg['From'] = gmail_user
    msg['To'] = ", ".join(recipients)
    if cc_recipients:
        msg['Cc'] = ", ".join(cc_recipients)
    msg['Subject'] = subject

    msg.attach(MIMEText(body, 'html'))

    # Attach reports
    for file_path in attachment_paths:
        if os.path.exists(file_path):
            try:
                with open(file_path, "rb") as f:
                    part = MIMEApplication(f.read(), Name=os.path.basename(file_path))
                part['Content-Disposition'] = f'attachment; filename="{os.path.basename(file_path)}"'
                msg.attach(part)
                logger.info(f"Attached report: {os.path.basename(file_path)}")
            except Exception as e:
                logger.error(f"Could not attach file {file_path}: {e}")
        else:
            logger.warning(f"Attachment file not found: {file_path}")

    # SMTP configuration options
    smtp_host = (
        get_system_config("smtp_host")
        or os.getenv("SMTP_HOST")
        or get_system_config("smtp_server")
        or os.getenv("SMTP_SERVER")
        or "smtp.gmail.com"
    )
    
    port_cfg = get_system_config("smtp_port") or os.getenv("SMTP_PORT") or "587"
    try:
        smtp_port = int(port_cfg)
    except ValueError:
        smtp_port = 587

    ssl_cfg = get_system_config("smtp_use_ssl") or os.getenv("SMTP_USE_SSL", "")
    use_ssl = ssl_cfg.lower() in ("true", "1", "yes") or smtp_port == 465

    # Connect and send
    try:
        logger.info(f"Connecting to SMTP server {smtp_host}:{smtp_port}...")
        if use_ssl:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=30)
            server.ehlo()
        else:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=30)
            server.ehlo()
            server.starttls()
            server.ehlo()

        logger.info(f"Logging in as {gmail_user}...")
        server.login(gmail_user, gmail_password)
        server.sendmail(gmail_user, envelope_recipients, msg.as_string())
        server.quit()
        logger.info("Email delivered successfully.")
        return (True, "Email delivered successfully.") if return_detail else True
    except smtplib.SMTPAuthenticationError as e:
        auth_err = e.smtp_error.decode('utf-8', errors='ignore') if isinstance(e.smtp_error, bytes) else str(e.smtp_error)
        err_msg = f"SMTP Authentication failed for {gmail_user}: {auth_err or 'Invalid credentials or App Password required'}"
        logger.error(err_msg)
        return (False, err_msg) if return_detail else False
    except Exception as e:
        err_msg = f"Failed to send email via SMTP server ({smtp_host}:{smtp_port}): {e}"
        logger.error(err_msg)
        return (False, err_msg) if return_detail else False
