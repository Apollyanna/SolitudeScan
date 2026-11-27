FROM python:3-alpine
# The date keys the build cache so this layer installs today's OS fixes; AppJet keeps it current on deploy.
RUN echo "os-refresh 2026-11-27" && apk upgrade --no-cache
WORKDIR /app
COPY . .
ENV PORT=3000
EXPOSE 3000
# Static files served on all interfaces; honors the platform's $PORT.
RUN mkdir -p /app /home/appjet && chown -R 10001:10001 /app /home/appjet
ENV HOME=/home/appjet
USER 10001:10001
CMD python3 -m http.server "$PORT" --bind 0.0.0.0
