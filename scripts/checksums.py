import hashlib,pathlib
root=pathlib.Path('release')
(root/'SHA256SUMS.txt').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in sorted(root.glob('*.zip'))))
