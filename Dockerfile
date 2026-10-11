# The Symphony App's webhook server. python:3.12-slim carries the openssl
# binary (Debian's ca-certificates depends on it), which signs the App's
# JWT (app/jwt.py), and the backend needs nothing else outside Python's
# standard library, so nothing is installed. The RUN line below fails the
# build if a later image ever drops openssl, rather than the first event.
FROM python:3.12-slim

RUN openssl version \
    && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin sdlc

WORKDIR /srv/symphony-app
COPY app/ app/

# A user of its own, so the server can read the key it is given and
# nothing else on the host a mount might expose.
USER sdlc
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s \
    CMD ["python3", "-c", "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ.get('PORT', '3000'), timeout=4)"]

ENTRYPOINT ["python3", "-m", "app.webhook"]
