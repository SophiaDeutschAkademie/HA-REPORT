#!/usr/bin/env python3
"""HA-REPORT 도구: 학생 아이디와 비밀번호로 리포트와 시험 기록을 암호화해 data/ 에 저장합니다.

로그인: 학생이 아이디(이름)와 비밀번호 20자리를 입력합니다. 파일 이름은 아이디에서 계산한 값이라
저장소만 봐서는 누가 등록되어 있는지 알 수 없습니다. 비밀번호와 관리 비밀번호는 저장소에 저장하지 않습니다.

사용법 (저장소 루트에서 실행)
  python3 tools/hareport.py init-admin
      관리 비밀번호를 만들고 가짜 파일(decoy)을 채웁니다. 처음 한 번만 실행합니다.
  python3 tools/hareport.py new-student --name 김민서 --level B1 --admin-password 관리비밀번호 [--id 김민서2]
      새 학생을 만들고 20자리 학생 비밀번호를 한 번만 출력합니다. 아이디는 기본이 이름입니다.
      같은 이름이 두 명이면 --id 로 다른 아이디를 줍니다.
  python3 tools/hareport.py add-exam --id 김민서 --password 학생비밀번호 --json exam.json
  python3 tools/hareport.py add-report --id 김민서 --password 학생비밀번호 --level B1 --exam-n 2 --title "Medien im Alltag" --date 2026-10-28 --html 리포트.html
  python3 tools/hareport.py add-voka --id 김민서 --password 학생비밀번호 --week 6 --level A1 --title "VOKA 6주차" --date 2026-10-19 --html VOKA6주차.html
      VOKA 탭에 주차별 학생용 리포트를 등록합니다. 같은 레벨에서 같은 주차를 다시 올리면 덮어씁니다.
  python3 tools/hareport.py show --id 김민서 --password 학생비밀번호
  python3 tools/hareport.py resize-decoys --admin-password 관리비밀번호
      가짜 파일의 크기를 30KB~900KB로 다시 정합니다. 학생 파일이 커져 눈에 띌 때 실행합니다.

레벨: 시험과 리포트는 레벨(A1~B2)별로 저장하고, 회차 번호(n)는 레벨 안에서 셉니다. 로그인한 뒤 학생이 레벨 버튼으로 골라 봅니다.
  - exam.json 의 level 이나 add-report 의 --level 을 생략하면 학생의 기본 레벨로 저장합니다.
  - 같은 레벨에서 같은 n 을 다시 올리면 덮어씁니다. 레벨이 다르면 n 이 같아도 따로 저장합니다.

학생 파일과 가짜 파일은 이름과 크기로 구별되지 않고, 전체 파일 수는 20개 단위로 늘어납니다.
아이디 정규화: NFKC, 공백 제거, 소문자. 파일 이름: PBKDF2-SHA256(아이디, salt=ha-report-id-v1, 200000회)의 앞 10바이트(16진수 20자).
암호화: PBKDF2-HMAC-SHA256 600000회 -> AES-256-GCM. 파일 형식: salt(16) + iv(12) + 암호문. 인증 데이터는 파일 id.
"""
import argparse, hashlib, json, os, re, secrets, sys, unicodedata
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
INDEX = DATA / 'index.json'
LEVELS = ['A1', 'A2', 'B1', 'B2']
ITER = 600000
AREAS = ['grammar', 'satz', 'vocab', 'reading', 'listening', 'writing']

UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
LOWER = 'abcdefghijkmnopqrstuvwxyz'
DIGIT = '23456789'


def make_password(n=20):
    chars = [secrets.choice(UPPER) for _ in range(5)] + [secrets.choice(LOWER) for _ in range(5)] + [secrets.choice(DIGIT) for _ in range(5)]
    pool = UPPER + LOWER + DIGIT
    chars += [secrets.choice(pool) for _ in range(n - len(chars))]
    secrets.SystemRandom().shuffle(chars)
    return ''.join(chars)


def derive(password, salt):
    pw = unicodedata.normalize('NFKC', password.strip()).encode('utf-8')
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(pw)


def encrypt(obj, password, sid):
    salt, iv = os.urandom(16), os.urandom(12)
    ct = AESGCM(derive(password, salt)).encrypt(iv, json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8'), sid.encode())
    return salt + iv + ct


def decrypt(blob, password, sid):
    salt, iv, ct = blob[:16], blob[16:28], blob[28:]
    return json.loads(AESGCM(derive(password, salt)).decrypt(iv, ct, sid.encode()).decode('utf-8'))


def lv_of(x, b):
    # 레벨이 없는 옛 기록은 학생 기본 레벨로 봅니다.
    return x.get('level') or b['level']


def lv_key(x, b):
    lv = lv_of(x, b)
    return (LEVELS.index(lv) if lv in LEVELS else len(LEVELS), x['n'])


def norm_id(s):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', s).strip()).lower()


def file_id(s):
    return hashlib.pbkdf2_hmac('sha256', norm_id(s).encode('utf-8'), b'ha-report-id-v1', 200000, dklen=10).hex()


def count_files():
    return len([f for f in DATA.glob('*.bin') if f.name != 'admin.bin'])


def decoy_size():
    # 리포트가 쌓이면 학생 파일이 커지므로, 가짜 파일도 30KB~900KB 사이에서 고르게 뽑습니다.
    return secrets.choice(range(30000, 900000))


def make_decoy():
    sid = secrets.token_hex(10)
    (DATA / (sid + '.bin')).write_bytes(os.urandom(decoy_size()))
    return sid


def read_admin(apw):
    try:
        return decrypt((DATA / 'admin.bin').read_bytes(), apw, 'admin')
    except Exception:
        sys.exit('관리 비밀번호가 맞지 않거나 admin.bin이 없습니다.')


def write_admin(obj, apw):
    (DATA / 'admin.bin').write_bytes(encrypt(obj, apw, 'admin'))


def read_bundle(login_id, password):
    sid = file_id(login_id)
    f = DATA / (sid + '.bin')
    if not f.exists():
        sys.exit('아이디가 없습니다: %s' % login_id)
    try:
        return decrypt(f.read_bytes(), password, sid), sid
    except Exception:
        sys.exit('학생 비밀번호가 맞지 않습니다.')


def write_bundle(bundle, sid, password):
    (DATA / (sid + '.bin')).write_bytes(encrypt(bundle, password, sid))


def cmd_init(a):
    DATA.mkdir(exist_ok=True)
    if (DATA / 'admin.bin').exists():
        sys.exit('admin.bin이 이미 있습니다. 관리 비밀번호를 다시 만들지 않습니다.')
    apw = make_password()
    dec = []
    total = count_files()
    while total % 20 != 0 or total == 0:
        dec.append(make_decoy()); total += 1
    write_admin({'decoys': dec}, apw)
    print('관리 비밀번호: %s' % apw)


def cmd_resize_decoys(a):
    A = read_admin(a.admin_password)
    for d in A['decoys']:
        f = DATA / (d + '.bin')
        if f.exists():
            f.write_bytes(os.urandom(decoy_size()))
    print('가짜 파일 %d개의 크기를 다시 정했습니다.' % len(A['decoys']))


def cmd_new(a):
    if a.level not in LEVELS:
        sys.exit('레벨은 %s 중 하나입니다.' % ', '.join(LEVELS))
    A = read_admin(a.admin_password)
    login = a.id or a.name
    sid = file_id(login)
    if (DATA / (sid + '.bin')).exists():
        sys.exit('이미 있는 아이디입니다. 같은 이름이면 --id 로 다른 아이디를 주십시오.')
    if A['decoys']:
        d = A['decoys'].pop()
        f = DATA / (d + '.bin')
        if f.exists():
            f.unlink()
    pw = make_password()
    write_bundle({'name': a.name, 'level': a.level, 'exams': [], 'reports': [], 'voka': []}, sid, pw)
    total = count_files()
    while total % 20 != 0:
        A['decoys'].append(make_decoy()); total += 1
    write_admin(A, a.admin_password)
    print('이름: %s\n레벨: %s\n아이디: %s\n비밀번호: %s' % (a.name, a.level, norm_id(login), pw))


def cmd_exam(a):
    b, sid = read_bundle(a.id, a.password)
    ex = json.loads(Path(a.json).read_text(encoding='utf-8'))
    for k in AREAS:
        if k not in ex.get('scores', {}):
            sys.exit('scores에 %s가 없습니다. (측정하지 않은 영역은 null로 씁니다.)' % k)
    ex['level'] = ex.get('level') or b['level']
    if ex['level'] not in LEVELS:
        sys.exit('레벨은 %s 중 하나입니다.' % ', '.join(LEVELS))
    b['exams'] = [e for e in b['exams'] if not (lv_of(e, b) == ex['level'] and e['n'] == ex['n'])] + [ex]
    b['exams'].sort(key=lambda e: lv_key(e, b))
    write_bundle(b, sid, a.password)
    print('시험 기록 저장: %s %s회차, 전체 %d회' % (ex['level'], ex['n'], len(b['exams'])))


def cmd_report(a):
    b, sid = read_bundle(a.id, a.password)
    html = Path(a.html).read_text(encoding='utf-8')
    lv = a.level or b['level']
    if lv not in LEVELS:
        sys.exit('레벨은 %s 중 하나입니다.' % ', '.join(LEVELS))
    r = {'n': a.exam_n, 'level': lv, 'title': a.title, 'date': a.date, 'html': html}
    b['reports'] = [x for x in b['reports'] if not (lv_of(x, b) == lv and x['n'] == a.exam_n)] + [r]
    b['reports'].sort(key=lambda x: lv_key(x, b))
    write_bundle(b, sid, a.password)
    print('리포트 저장: %s %s회차, %d자, 전체 %d개' % (lv, a.exam_n, len(html), len(b['reports'])))


def cmd_voka(a):
    b, sid = read_bundle(a.id, a.password)
    html = Path(a.html).read_text(encoding='utf-8')
    lv = a.level or b['level']
    if lv not in LEVELS:
        sys.exit('레벨은 %s 중 하나입니다.' % ', '.join(LEVELS))
    v = {'n': a.week, 'level': lv, 'title': a.title, 'date': a.date, 'html': html}
    b['voka'] = [x for x in b.get('voka', []) if not (lv_of(x, b) == lv and x['n'] == a.week)] + [v]
    b['voka'].sort(key=lambda x: (x['n'], x['date']))
    write_bundle(b, sid, a.password)
    print('VOKA 리포트 저장: %s %s주차, %d자, 전체 %d개' % (lv, a.week, len(html), len(b['voka'])))


def cmd_show(a):
    b, sid = read_bundle(a.id, a.password)
    for r in b['reports'] + b.get('voka', []):
        r['html'] = '(%d자)' % len(r['html'])
    print(json.dumps(b, ensure_ascii=False, indent=1))


def main():
    p = argparse.ArgumentParser(description='HA-REPORT 도구')
    sub = p.add_subparsers(dest='cmd', required=True)
    sub.add_parser('init-admin').set_defaults(f=cmd_init)
    n = sub.add_parser('new-student'); [n.add_argument('--' + k, required=True) for k in ('name', 'level', 'admin-password')]
    n.add_argument('--id'); n.set_defaults(f=cmd_new)
    e = sub.add_parser('add-exam'); [e.add_argument('--' + k, required=True) for k in ('id', 'password', 'json')]; e.set_defaults(f=cmd_exam)
    r = sub.add_parser('add-report'); [r.add_argument('--' + k, required=True) for k in ('id', 'password', 'title', 'date', 'html')]
    r.add_argument('--exam-n', type=int, required=True); r.add_argument('--level'); r.set_defaults(f=cmd_report)
    v = sub.add_parser('add-voka'); [v.add_argument('--' + k, required=True) for k in ('id', 'password', 'title', 'date', 'html')]
    v.add_argument('--week', type=int, required=True); v.add_argument('--level'); v.set_defaults(f=cmd_voka)
    z = sub.add_parser('resize-decoys'); z.add_argument('--admin-password', required=True); z.set_defaults(f=cmd_resize_decoys)
    s = sub.add_parser('show'); [s.add_argument('--' + k, required=True) for k in ('id', 'password')]; s.set_defaults(f=cmd_show)
    a = p.parse_args(); a.f(a)


if __name__ == '__main__':
    main()
