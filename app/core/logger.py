import logging

def log_config() -> None:
    logging.basicConfig(
        level=logging.info,
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )