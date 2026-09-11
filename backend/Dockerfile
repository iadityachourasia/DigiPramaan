FROM python:3.11-slim

WORKDIR /app

# System deps for psycopg3's binary wheel are usually unnecessary, but
# libpq is kept lightweight here in case the platform falls back to source.
# libgl1 + libglib2.0-0: opencv-contrib-python (a transitive dependency of
# paddleocr, imported directly by app/services/barcode/detect.py) links
# against libGL at import time even in this headless container — without
# it, `import cv2` fails with "ImportError: libGL.so.1: cannot open shared
# object file" and the whole app crashes on startup.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev gcc libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./

RUN pip install --no-cache-dir .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
