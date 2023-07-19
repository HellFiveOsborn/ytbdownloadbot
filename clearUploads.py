import os
import shutil
from datetime import datetime, timedelta

script_dir = os.path.dirname(os.path.abspath(__file__)) 
output_dir = os.path.join(script_dir, 'output')

# Obtem todas as pastas em /output/
folders = [f for f in os.listdir(output_dir) if os.path.isdir(os.path.join(output_dir, f))]

# Loop pelas pastas
for folder in folders:

  # Obtem datetime de criação da pasta
  folder_path = os.path.join(output_dir, folder)  
  timestamp = os.path.getctime(folder_path)
  creation_date = datetime.fromtimestamp(timestamp)

  # Limite de 30 minutos
  limit = datetime.now() - timedelta(minutes=30) 

  # Se pasta foi criada a mais de 1 dia, deleta
  if creation_date < limit:  
    print(f'Deletando pasta antiga: {folder}')
    shutil.rmtree(folder_path)