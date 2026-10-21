FROM python:3.12-slim
WORKDIR /app
COPY server.py manage.py ./
COPY public ./public
RUN useradd --create-home campaign && mkdir /data && chown campaign:campaign /data
USER campaign
ENV PORT=8000 DATABASE_PATH=/data/campaigns.db
EXPOSE 8000
CMD ["python", "server.py"]
