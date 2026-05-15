FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Supervisor config — runs API + Celery worker+beat in one container
RUN echo '[supervisord]\nnodaemon=true\nlogfile=/dev/null\nlogfile_maxbytes=0\n\n\
[program:api]\ncommand=uvicorn app.main:app --host 0.0.0.0 --port 8000\n\
stdout_logfile=/dev/stdout\nstdout_logfile_maxbytes=0\n\
stderr_logfile=/dev/stderr\nstderr_logfile_maxbytes=0\n\
autorestart=true\n\n\
[program:worker]\ncommand=celery -A app.tasks.celery_app:celery_app worker --beat --loglevel=info --concurrency=1\n\
stdout_logfile=/dev/stdout\nstdout_logfile_maxbytes=0\n\
stderr_logfile=/dev/stderr\nstderr_logfile_maxbytes=0\n\
autorestart=true\n' > /etc/supervisor/conf.d/secondbrain.conf

EXPOSE 8000

CMD ["supervisord", "-c", "/etc/supervisor/supervisord.conf"]
