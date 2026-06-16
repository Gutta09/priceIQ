FROM python:3.9-slim

WORKDIR /app/backend

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Frontend dist is mounted/copied at container start via build.sh
# In production, the parent build.sh copies frontend/dist here before docker build

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
