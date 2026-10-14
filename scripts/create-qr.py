#!/usr/bin/env python3
"""Usage: python scripts/create-qr.py https://your-domain.example
Requires: pip install qrcode[pil]"""
import sys, pathlib
try: import qrcode
except ImportError: raise SystemExit('Install qrcode[pil] first: pip install "qrcode[pil]"')
from urllib.parse import urlsplit, urlunsplit, urlencode, parse_qsl
if len(sys.argv) < 2: raise SystemExit('Pass your actual HTTPS website domain as the first argument.')
url = sys.argv[1].strip().rstrip('/')
if not url.startswith('https://'): raise SystemExit('Use your actual public HTTPS website domain.')
url = url + '/?r=chatako-btm2&utm_source=in_store&utm_medium=qr'
path = pathlib.Path(__file__).parent.parent/'chatako-store-qr.png'
qrcode.make(url).save(path)
print('Saved',path,'\nURL:',url)
