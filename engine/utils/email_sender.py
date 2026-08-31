import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from engine.utils.helpers import get_system_config

logger = logging.getLogger("bsa_email_sender")

def send_email_with_attachment(subject: str, body: str, attachment_paths: list[str], custom_recipients: list[str] = None) -> bool:
    """
    Sends an email using SMTP credentials from PostgreSQL `system_config` table.
    """
    gmail_user = get_system_config("gmail_user")
    gmail_password = get_system_config("gmail_app_password")

    if not gmail_user or not gmail_password:
        logger.error("Missing Gmail credentials in system_config table.")
        return False

    recipients = custom_recipients or [gmail_user]
    if not recipients:
        logger.error("No email recipients provided.")
        return False

    # Set up the MIME message
    msg = MIMEMultipart()
    msg['From'] = gmail_user
    msg['To'] = ", ".join(recipients)
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

    # Connect and send
    try:
        logger.info("Connecting to smtp.gmail.com...")
        server = smtplib.SMTP('smtp.gmail.com', 587)
        server.ehlo()
        server.starttls()
        server.ehlo()
        
        logger.info(f"Logging in as {gmail_user}...")
        server.login(gmail_user, gmail_password)
        server.sendmail(gmail_user, recipients, msg.as_string())
        server.quit()
        logger.info("Email delivered successfully.")
        return True
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        return False
