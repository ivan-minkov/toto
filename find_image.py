import json
import re
import os
import shutil

transcript_path = r'C:\Users\User\.gemini\antigravity-ide\brain\6cdef2e7-ccab-4b75-ba45-77ef2ebe92e7\.system_generated\logs\transcript_full.jsonl'
with open(transcript_path, 'r', encoding='utf-8') as f:
    text = f.read()

# Look for all image file paths
matches = re.findall(r'[A-Za-z]:\\[^"\'\n\r<>]+\.(?:jpg|jpeg|png)', text)
existing_files = [m for m in matches if os.path.exists(m)]

print(f"Found {len(existing_files)} existing images")
for p in existing_files[-10:]:
    print(p, os.path.getsize(p))

# Look for largest or newest jpg that is not a browser recording
candidates = [p for p in existing_files if not 'browser' in p.lower() and not 'click_feedback' in p.lower()]
if not candidates:
    candidates = existing_files

target = candidates[-1]
os.makedirs('assets', exist_ok=True)
shutil.copy(target, 'assets/user_receipt.jpg')
print(f"Copied {target} to assets/user_receipt.jpg ({os.path.getsize('assets/user_receipt.jpg')} bytes)")
