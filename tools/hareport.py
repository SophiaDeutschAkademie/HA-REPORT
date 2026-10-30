#!/usr/bin/env python3
"""HA-REPORT 도구: 학생 아이디와 비밀번호로 리포트와 시험 기록을 암호화해 data/ 에 저장합니다.

로그인: 학생이 아이디(이름)와 비밀번호 20자리를 입력합니다. 파일 이름은 아이디에서 계산한 값이라
저장소만 봐서는 누가 등록되어 있는지 알 수 없습니다. 비밀번호와 관리 비밀번호는 저장소에 저장하지 않습니다.

사용법 (저장소 루트에서 실행)
  python3 tools/hareport.py init-admin [--replace-legacy]
      관리자 파일(아이디 김종훈)을 만들고 관리 비밀번호를 한 번만 출력합니다. 처음 한 번만 실행합니다.
      관리자 파일에는 학생 명단과 학생 비밀번호가 들어 있어, 로그인 화면에서 김종훈으로 로그인하면 관리자 페이지가 열립니다.
      옛 data/admin.bin(가짜 파일 목록)이 있으면 --replace-legacy 로 지웁니다.
  python3 tools/hareport.py new-student --name 김민서 --level B1 --admin-password 관리비밀번호 [--id 김민서2] [--password 20자리비밀번호] [--grammatik]
      새 학생을 만들고 20자리 학생 비밀번호를 한 번만 출력합니다. 아이디는 기본이 이름입니다.
      같은 이름이 두 명이면 --id 로 다른 아이디를 줍니다. 명단에도 자동으로 들어갑니다.
  python3 tools/hareport.py link-student --id 김민서 --password 학생비밀번호 --admin-password 관리비밀번호
      이미 있는 학생을 관리자 명단에 넣습니다. 비밀번호를 모르면 --no-password 로 넣고 관리자 페이지에서 나중에 입력합니다.
  python3 tools/hareport.py remove-student --id 김민서 --admin-password 관리비밀번호
      학생을 뺍니다. 학생 파일은 무작위 바이트로 덮어써서 가짜 파일이 되고, 그 학생은 로그인할 수 없습니다.
  python3 tools/hareport.py list-students --admin-password 관리비밀번호 [--show-passwords]
  python3 tools/hareport.py pad-students --admin-password 관리비밀번호
      내용이 적은 학생 파일에 무작위 채움을 넣어 가짜 파일과 비슷한 크기로 만듭니다. 새 학생과 기록을 저장할 때는 자동으로 적용됩니다.
  python3 tools/hareport.py set-token --admin-password 관리비밀번호 --token GitHub토큰 [--clear]
      GitHub 토큰을 관리자 파일 안에 관리 비밀번호로 암호화해 넣습니다. 관리자 로그인만 하면 토큰을 따로 입력하지 않아도 됩니다.
  python3 tools/hareport.py add-exam --id 김민서 --password 학생비밀번호 --json exam.json
  python3 tools/hareport.py add-report --id 김민서 --password 학생비밀번호 --level B1 --exam-n 2 --title "Medien im Alltag" --date 2026-10-28 --html 리포트.html
  python3 tools/hareport.py add-voka --id 김민서 --password 학생비밀번호 --week 6 --level A1 --title "VOKA 6주차" --date 2026-10-19 --html VOKA6주차.html
      VOKA 탭에 주차별 학생용 리포트를 등록합니다. 같은 레벨에서 같은 주차를 다시 올리면 덮어씁니다.
      --level 은 A1, A2, B1, B2, C1 입니다. 열람 페이지 VOKA 탭에서는 A1과 A2가 "A1-A2" 버튼 하나로 묶여 보입니다.
  python3 tools/hareport.py enroll-grammatik --id 이지아 --password 학생비밀번호
      문법반 학생에게 GRAMMATIK 탭을 켭니다(리포트 0개). 새 학생은 new-student 에 --grammatik 을 붙여도 됩니다.
  python3 tools/hareport.py add-grammatik --id 이지아 --password 학생비밀번호 --n 1 --title "과제명" --date 2026-11-04 --rate 87 --html 리포트.html
      GRAMMATIK 탭에 리포트를 등록합니다. 같은 번호를 다시 올리면 덮어씁니다.
      --rate 는 그 회차의 정답률(%)이고, 리포트가 2개 이상 쌓이면 GRAMMATIK 탭 위쪽 '실력 향상도' 그래프에 그려집니다.
      다시 올릴 때 --rate 를 생략하면 이전에 넣은 정답률을 그대로 둡니다.
  python3 tools/hareport.py show --id 김민서 --password 학생비밀번호
  python3 tools/hareport.py resize-decoys --admin-password 관리비밀번호
      관리자 파일에 기록된 가짜 파일의 크기를 30KB~900KB로 다시 정합니다. 학생 파일이 커져 눈에 띌 때 실행합니다.

레벨: 시험과 리포트는 레벨(A1, A2, B1, B2, GRAMMATIK, ZERTIFIKAT A2, ZERTIFIKAT B1, ZERTIFIKAT B2)별로 저장하고, 회차 번호(n)는 레벨 안에서 셉니다. 로그인한 뒤 학생이 레벨 버튼으로 골라 봅니다.
  - exam.json 의 level 이나 add-report 의 --level 을 생략하면 학생의 기본 레벨로 저장합니다.
  - 같은 레벨에서 같은 n 을 다시 올리면 덮어씁니다. 레벨이 다르면 n 이 같아도 따로 저장합니다.

학생 파일과 가짜 파일은 이름과 크기로 구별되지 않고, 전체 파일 수는 20개 단위로 늘어납니다.
아이디 정규화: NFKC, 공백 제거, 소문자. 파일 이름: PBKDF2-SHA256(아이디, salt=ha-report-id-v1, 200000회)의 앞 10바이트(16진수 20자).
암호화: PBKDF2-HMAC-SHA256 600000회 -> AES-256-GCM. 파일 형식: salt(16) + iv(12) + 암호문. 인증 데이터는 파일 id.
"""
import argparse, hashlib, json, os, re, secrets, sys, unicodedata
from datetime import datetime, timedelta, timezone
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
INDEX = DATA / 'index.json'
LEVELS = ['A1', 'A2', 'B1', 'B2', 'GRAMMATIK', 'ZERTIFIKAT A2', 'ZERTIFIKAT B1', 'ZERTIFIKAT B2']
VOKA_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1']  # 열람 페이지 VOKA 탭의 레벨 버튼은 A1-A2(A1과 A2를 묶음), B1, B2, C1
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


ADMIN_LOGIN = '김종훈'


def admin_sid():
    return file_id(ADMIN_LOGIN)


def today_kst():
    return datetime.now(timezone(timedelta(hours=9))).strftime('%Y-%m-%d')


def read_admin(apw):
    # 관리자 파일은 일반 학생 파일과 똑같이 data/{파일 id}.bin 이고, 아이디는 김종훈입니다.
    f = DATA / (admin_sid() + '.bin')
    if not f.exists():
        sys.exit('관리자 파일이 없습니다. init-admin 을 먼저 실행하십시오.')
    try:
        A = decrypt(f.read_bytes(), apw, admin_sid())
    except Exception:
        sys.exit('관리 비밀번호가 맞지 않습니다.')
    A.setdefault('students', [])
    A.setdefault('decoys', [])
    return A


def write_admin(obj, apw):
    # 관리자 파일도 학생 파일처럼 가짜 파일과 비슷한 크기로 저장합니다.
    (DATA / (admin_sid() + '.bin')).write_bytes(encrypt(pad_bundle(obj), apw, admin_sid()))


def pad_decoys(A):
    # 전체 파일 수를 20개 단위로 맞춥니다. 학생 수를 파일 수로 알 수 없게 하려는 것입니다.
    total = count_files()
    while total % 20 != 0:
        A['decoys'].append(make_decoy()); total += 1


def read_bundle(login_id, password):
    sid = file_id(login_id)
    f = DATA / (sid + '.bin')
    if not f.exists():
        sys.exit('아이디가 없습니다: %s' % login_id)
    try:
        return decrypt(f.read_bytes(), password, sid), sid
    except Exception:
        sys.exit('학생 비밀번호가 맞지 않습니다.')


def pad_bundle(b):
    # 내용이 적은 학생 파일은 무작위 채움(pad)으로 가짜 파일과 비슷한 크기(30KB~900KB)로 만듭니다.
    # 파일 크기만 보고 실제 학생 파일을 가려내지 못하게 하려는 것입니다. 내용이 30KB를 넘으면 채움을 뺍니다.
    real = {k: v for k, v in b.items() if k != 'pad'}
    n = len(json.dumps(real, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
    if n >= 30000:
        return real
    if isinstance(b.get('pad'), str):
        return b
    want = decoy_size() - n
    real['pad'] = secrets.token_urlsafe(want * 3 // 4 + 4)[:want]
    return real


def write_bundle(bundle, sid, password):
    (DATA / (sid + '.bin')).write_bytes(encrypt(pad_bundle(bundle), password, sid))


def cmd_init(a):
    DATA.mkdir(exist_ok=True)
    if (DATA / (admin_sid() + '.bin')).exists():
        sys.exit('관리자 파일이 이미 있습니다. 관리 비밀번호를 다시 만들지 않습니다.')
    legacy = DATA / 'admin.bin'
    if legacy.exists():
        if not a.replace_legacy:
            sys.exit('옛 admin.bin(가짜 파일 목록)이 있습니다. 새 관리자 체계로 바꾸려면 --replace-legacy 를 붙이십시오.')
        legacy.unlink()
    apw = a.password or make_password()
    A = {'role': 'admin', 'name': ADMIN_LOGIN, 'level': '-', 'exams': [], 'reports': [], 'voka': [], 'students': [], 'decoys': []}
    write_admin(A, apw)
    pad_decoys(A)
    write_admin(A, apw)
    print('관리 아이디: %s\n관리 비밀번호: %s' % (ADMIN_LOGIN, apw))


def cmd_pad_students(a):
    A = read_admin(a.admin_password)
    n = 0
    for s in A['students']:
        if not s.get('password'):
            continue
        f = DATA / (s['fid'] + '.bin')
        if not f.exists():
            continue
        try:
            b = decrypt(f.read_bytes(), s['password'], s['fid'])
        except Exception:
            continue
        if pad_bundle(b) == b:
            continue
        write_bundle(b, s['fid'], s['password'])
        n += 1
    write_admin(A, a.admin_password)
    print('학생 파일 %d개와 관리자 파일의 크기를 가짜 파일과 비슷하게 맞췄습니다.' % n)


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
    exists = (DATA / (sid + '.bin')).exists()
    reuse = exists and sid in A['decoys']  # 삭제한 학생의 파일 자리는 가짜 파일로 남아 있으므로 다시 쓸 수 있습니다.
    if exists and not reuse:
        sys.exit('이미 있는 아이디입니다. 같은 이름이면 --id 로 다른 아이디를 주십시오.')
    if reuse:
        A['decoys'].remove(sid)
    elif A['decoys']:
        d = A['decoys'].pop()
        f = DATA / (d + '.bin')
        if f.exists():
            f.unlink()
    pw = a.password or make_password()
    if len(pw) != 20:
        sys.exit('비밀번호는 20자리여야 합니다.')
    bundle = {'name': a.name, 'level': a.level, 'exams': [], 'reports': [], 'voka': []}
    if a.grammatik or a.level == 'GRAMMATIK':
        bundle['grammatik'] = []
    write_bundle(bundle, sid, pw)
    A['students'].append({'id': login, 'fid': sid, 'name': a.name, 'level': a.level, 'password': pw, 'added': today_kst()})
    pad_decoys(A)
    write_admin(A, a.admin_password)
    print('이름: %s\n레벨: %s\n아이디: %s\n비밀번호: %s' % (a.name, a.level, norm_id(login), pw))


def cmd_link(a):
    # 이미 있는 학생을 관리자 명단에 넣습니다. 비밀번호를 모르면 --no-password 로 넣고, 관리자 페이지에서 나중에 입력합니다.
    A = read_admin(a.admin_password)
    sid = file_id(a.id)
    if not (DATA / (sid + '.bin')).exists():
        sys.exit('아이디가 없습니다: %s' % a.id)
    if a.password:
        b, _ = read_bundle(a.id, a.password)
        e = {'id': a.id, 'fid': sid, 'name': b['name'], 'level': b['level'], 'password': a.password, 'added': today_kst()}
    elif a.no_password:
        e = {'id': a.id, 'fid': sid, 'name': a.id, 'level': '-', 'password': None, 'added': today_kst()}
    else:
        sys.exit('--password 또는 --no-password 중 하나가 필요합니다.')
    old = next((s for s in A['students'] if s['fid'] == sid), None)
    if old:
        e['added'] = old.get('added') or e['added']
        A['students'][A['students'].index(old)] = e
    else:
        A['students'].append(e)
    write_admin(A, a.admin_password)
    print('명단에 반영: %s (%s)' % (e['name'], '비밀번호 있음' if e['password'] else '비밀번호 필요'))


def cmd_remove(a):
    # 학생을 뺍니다. 학생 파일은 무작위 바이트로 덮어써서 가짜 파일로 바뀌고, 파일 수는 그대로입니다.
    A = read_admin(a.admin_password)
    sid = file_id(a.id)
    e = next((s for s in A['students'] if s['fid'] == sid), None)
    if not e:
        sys.exit('명단에 없는 아이디입니다. list-students 로 확인하십시오.')
    f = DATA / (sid + '.bin')
    if f.exists():
        f.write_bytes(os.urandom(decoy_size()))
        A['decoys'].append(sid)
    A['students'].remove(e)
    write_admin(A, a.admin_password)
    print('뺐습니다: %s. 이 학생은 더 이상 로그인할 수 없습니다.' % e['name'])


def cmd_set_token(a):
    A = read_admin(a.admin_password)
    if a.clear:
        A.pop('token', None)
        write_admin(A, a.admin_password)
        print('관리자 파일에서 토큰을 지웠습니다.')
        return
    if not a.token or len(a.token) < 20:
        sys.exit('토큰을 --token 으로 주십시오.')
    A['token'] = a.token.strip()
    write_admin(A, a.admin_password)
    print('토큰을 관리자 파일(관리 비밀번호로 암호화)에 저장했습니다.')


def cmd_list(a):
    A = read_admin(a.admin_password)
    for s in A['students']:
        print('%s\t%s\t%s\t%s\t%s' % (s['name'], s['id'], s['level'], s.get('added', ''), (s['password'] if a.show_passwords else ('있음' if s['password'] else '없음'))))
    print('학생 %d명, 가짜 파일 %d개 기록, 전체 파일 %d개' % (len(A['students']), len(A['decoys']), count_files()))


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
    if lv not in VOKA_LEVELS:
        sys.exit('VOKA 레벨은 %s 중 하나입니다. --level 로 지정하십시오.' % ', '.join(VOKA_LEVELS))
    v = {'n': a.week, 'level': lv, 'title': a.title, 'date': a.date, 'html': html}
    b['voka'] = [x for x in b.get('voka', []) if not (lv_of(x, b) == lv and x['n'] == a.week)] + [v]
    b['voka'].sort(key=lambda x: (x['n'], x['date']))
    write_bundle(b, sid, a.password)
    print('VOKA 리포트 저장: %s %s주차, %d자, 전체 %d개' % (lv, a.week, len(html), len(b['voka'])))


def cmd_enroll_grammatik(a):
    b, sid = read_bundle(a.id, a.password)
    if 'grammatik' in b:
        print('이미 GRAMMATIK 탭 대상입니다. 리포트 %d개' % len(b['grammatik']))
        return
    b['grammatik'] = []
    write_bundle(b, sid, a.password)
    print('GRAMMATIK 탭을 켰습니다. 리포트 0개')


def cmd_grammatik(a):
    b, sid = read_bundle(a.id, a.password)
    html = Path(a.html).read_text(encoding='utf-8')
    g = {'n': a.n, 'title': a.title, 'date': a.date, 'html': html}
    prev = next((x for x in b.get('grammatik', []) if x['n'] == a.n), None)
    rate = a.rate if a.rate is not None else (prev or {}).get('rate')
    if rate is not None:
        if not 0 <= rate <= 100:
            sys.exit('--rate 는 0~100 사이의 정답률(%)이어야 합니다.')
        g['rate'] = rate
    b['grammatik'] = [x for x in b.get('grammatik', []) if x['n'] != a.n] + [g]
    b['grammatik'].sort(key=lambda x: (x['n'], x['date']))
    write_bundle(b, sid, a.password)
    print('GRAMMATIK 리포트 저장: %s번, %d자, 정답률 %s, 전체 %d개' % (a.n, len(html), ('%s%%' % rate) if rate is not None else '없음', len(b['grammatik'])))


def cmd_show(a):
    b, sid = read_bundle(a.id, a.password)
    for r in b['reports'] + b.get('voka', []) + b.get('grammatik', []):
        r['html'] = '(%d자)' % len(r['html'])
    print(json.dumps(b, ensure_ascii=False, indent=1))


def main():
    p = argparse.ArgumentParser(description='HA-REPORT 도구')
    sub = p.add_subparsers(dest='cmd', required=True)
    i = sub.add_parser('init-admin'); i.add_argument('--password'); i.add_argument('--replace-legacy', action='store_true'); i.set_defaults(f=cmd_init)
    k = sub.add_parser('link-student'); k.add_argument('--id', required=True); k.add_argument('--admin-password', required=True)
    k.add_argument('--password'); k.add_argument('--no-password', action='store_true'); k.set_defaults(f=cmd_link)
    m = sub.add_parser('remove-student'); [m.add_argument('--' + x, required=True) for x in ('id', 'admin-password')]; m.set_defaults(f=cmd_remove)
    t = sub.add_parser('set-token'); t.add_argument('--admin-password', required=True); t.add_argument('--token'); t.add_argument('--clear', action='store_true'); t.set_defaults(f=cmd_set_token)
    pd = sub.add_parser('pad-students'); pd.add_argument('--admin-password', required=True); pd.set_defaults(f=cmd_pad_students)
    l = sub.add_parser('list-students'); l.add_argument('--admin-password', required=True); l.add_argument('--show-passwords', action='store_true'); l.set_defaults(f=cmd_list)
    n = sub.add_parser('new-student'); [n.add_argument('--' + k, required=True) for k in ('name', 'level', 'admin-password')]; n.add_argument('--password')
    n.add_argument('--id'); n.add_argument('--grammatik', action='store_true'); n.set_defaults(f=cmd_new)
    e = sub.add_parser('add-exam'); [e.add_argument('--' + k, required=True) for k in ('id', 'password', 'json')]; e.set_defaults(f=cmd_exam)
    r = sub.add_parser('add-report'); [r.add_argument('--' + k, required=True) for k in ('id', 'password', 'title', 'date', 'html')]
    r.add_argument('--exam-n', type=int, required=True); r.add_argument('--level'); r.set_defaults(f=cmd_report)
    v = sub.add_parser('add-voka'); [v.add_argument('--' + k, required=True) for k in ('id', 'password', 'title', 'date', 'html')]
    v.add_argument('--week', type=int, required=True); v.add_argument('--level'); v.set_defaults(f=cmd_voka)
    q = sub.add_parser('enroll-grammatik'); [q.add_argument('--' + k, required=True) for k in ('id', 'password')]; q.set_defaults(f=cmd_enroll_grammatik)
    g = sub.add_parser('add-grammatik'); [g.add_argument('--' + k, required=True) for k in ('id', 'password', 'title', 'date', 'html')]
    g.add_argument('--n', type=int, required=True); g.add_argument('--rate', type=int); g.set_defaults(f=cmd_grammatik)
    z = sub.add_parser('resize-decoys'); z.add_argument('--admin-password', required=True); z.set_defaults(f=cmd_resize_decoys)
    s = sub.add_parser('show'); [s.add_argument('--' + k, required=True) for k in ('id', 'password')]; s.set_defaults(f=cmd_show)
    a = p.parse_args(); a.f(a)


if __name__ == '__main__':
    main()
