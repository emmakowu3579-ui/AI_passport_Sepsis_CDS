import urllib.request

urls = [
    'https://physionet.org/files/challenge-2019/1.0.0/training/training_setA/p000001.psv',
    'https://physionet.org/files/challenge-2019/1.0.0/training/training_setA.zip',
    'https://physionet-open.s3.amazonaws.com/challenge-2019/1.0.0/training/training_setA.zip',
    'https://physionet-open.s3.amazonaws.com/challenge-2019/1.0.0/training_setA.zip',
    'https://physionet-open.s3.amazonaws.com/challenge-2019/1.0.0/training/training_setA/p000001.psv',
    'https://archive.physionet.org/users/shared/challenge-2019/training_setA.zip'
]

headers = {'User-Agent': 'Mozilla/5.0'}
for u in urls:
    try:
        req = urllib.request.Request(u, headers=headers)
        with urllib.request.urlopen(req, timeout=5) as r:
            cl = r.headers.get('Content-Length')
            ct = r.headers.get('Content-Type')
            print(f"SUCCESS {u}: status={r.status}, size={cl}, type={ct}")
    except Exception as e:
        print(f"FAIL {u}: {e}")
