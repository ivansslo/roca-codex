import hashlib
salt = bytes.fromhex('0e2a629a4aa4d5fa8d467e84351d8679')
passphrase = b'Sp3ctr4L1s!r'
key = hashlib.pbkdf2_hmac('sha512', passphrase, salt, 600000, dklen=64)
print('KENC:', key[:32].hex())
print('KMAC:', key[32:].hex())
