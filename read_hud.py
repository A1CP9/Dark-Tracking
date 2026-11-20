"""Read an already cropped MW4 weapon-name image. Requires tesseract + English language data."""
import argparse
import csv
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).parent
def normalize(text):
    return ' '.join(re.findall('[A-Z0-9]+', text.upper()))

def identify(image):
    with (ROOT / 'weapons.csv').open() as source:
        names = {normalize(row['game_weapon']): row['game_weapon'] for row in csv.DictReader(source)}
    variants = {'M4 HURRICANE': ('M4', 'Hurricane'), 'AXION REAVER': ('Axion', 'Reaver')}
    response = subprocess.run(['tesseract', str(image), 'stdout', '-l', 'eng', '--psm', '7', 'tsv'],
                              capture_output=True, text=True, check=True)
    words = [row for row in csv.DictReader(response.stdout.splitlines(), delimiter='\t')
             if row['level'] == '5' and row['text'].strip()]
    label = normalize(' '.join(row['text'] for row in words))
    result = {'read': label, 'weapon': None, 'apex': None, 'other_slots': 'unknown'}
    if words and min(float(row['conf']) for row in words) >= 75:
        if label in variants:
            result['weapon'], result['apex'] = variants[label]
        elif label in names:
            result['weapon'] = names[label]
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('image', type=Path)
    print(json.dumps(identify(parser.parse_args().image)))
