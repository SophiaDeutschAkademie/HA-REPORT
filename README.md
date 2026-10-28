# HA-REPORT

Sophia Deutsch Akademie 과제 첨삭 리포트 열람 페이지입니다.

- 열람 방법: 아이디(이름)와 비밀번호 20자리를 입력해 로그인하면 자신의 발전 기록 그래프와 리포트가 열립니다. 로그인한 뒤 A2 · B1 · B2 버튼으로 레벨을 골라 그 레벨의 기록과 리포트를 봅니다.
- 학생마다 비밀번호가 다릅니다. 비밀번호는 이 저장소에 없습니다.
- 리포트와 시험 기록은 `data/{파일 id}.bin`에 암호화되어 있습니다(PBKDF2-SHA256 600000회, AES-256-GCM). 파일 id는 아이디에서 계산한 값이라 저장소만 봐서는 누가 등록되어 있는지 알 수 없습니다.
- 가짜 파일이 섞여 있어 파일 수로 학생 수를 알 수 없고, 전체 파일 수는 20개 단위로 늘어납니다.
- 화면에는 이름 목록, 레벨 목록, 학생 수가 없습니다.

## 관리자 페이지 (선생님용)

- 로그인 화면에서 아이디 `김종훈`과 관리 비밀번호로 로그인하면 관리자 페이지가 열립니다. 관리자 파일도 학생 파일과 같은 방식(`data/{파일 id}.bin`)으로 암호화되어 있어 저장소만 봐서는 구별되지 않습니다.
- 관리자 파일에는 학생 명단과 학생 비밀번호가 들어 있습니다. 관리자 페이지는 이 비밀번호로 브라우저 안에서 학생 파일을 열어 현황을 계산합니다. 관리 비밀번호가 곧 모든 학생 기록의 열쇠이므로 학생에게 알리지 않습니다.
- 학생 현황: 이름, 레벨, 문법반 여부, 과제 첨삭·VOKA·GRAMMATIK의 마지막 등록일과 개수, 마지막 등록 후 지난 날 수, 상태. 마지막 등록일이 기준(기본 7일) 이상 지난 학생은 붉게 표시하고 맨 위에 둡니다. 기준 일수는 화면에서 바꿀 수 있습니다. 기록이 아직 없는 학생은 명단에 넣은 날부터 셉니다.
- 마지막 등록일은 시험 기록·리포트·VOKA·GRAMMATIK 가운데 가장 늦은 날짜이고, 선생님이 올린 기록의 날짜입니다. 학생이 실제로 과제를 낸 날과 다를 수 있습니다.
- 학생 추가·삭제·기존 학생 연결은 GitHub API로 저장소에 커밋 한 번을 올립니다. GitHub 토큰(fine-grained, HA-REPORT 저장소만, Contents Read and write)이 필요하고, 토큰은 저장소에 올라가지 않습니다. 토큰이 없으면 현황만 볼 수 있습니다. 커밋 메시지는 학생이 드러나지 않게 "데이터 갱신"으로 고정되어 있습니다. 올린 뒤 GitHub Pages에 반영되기까지 1~2분 걸립니다.
- 학생 삭제는 그 학생 파일을 무작위 바이트로 덮어써서 가짜 파일로 바꿉니다. 파일 수는 그대로이고 그 학생은 더 이상 로그인할 수 없습니다. 암호화된 옛 기록은 GitHub 커밋 이력에만 남습니다.
- 학생을 추가하면 파일 수를 20개 단위로 맞춥니다. 관리자 파일에 기록된 가짜 파일이 있으면 하나를 지우고, 없으면 새 가짜 파일을 채웁니다. 기록에 없는 파일은 학생 파일일 수 있어 지우지 않습니다.
- 명단에 있지만 비밀번호가 없는 학생은 "비밀번호 필요"로 보이고, 그 줄에서 비밀번호를 입력해 연결합니다. 토큰이 없어도 비밀번호가 맞는지 확인해 현황에 반영하고, 토큰을 입력하는 순간 저장합니다(저장 전에 로그아웃하면 사라집니다).
- 현황 표의 "레벨·반" 칸에서 학생의 기본 레벨을 바로 바꿉니다. 레벨을 바꿔도 GRAMMATIK 탭과 리포트는 그대로입니다. 목록에서 GRAMMATIK을 고르면 다른 레벨만 있는 학생에게도 GRAMMATIK 탭을 만들고, 기존 레벨은 그대로 둡니다. 탭이 있는 학생은 레벨 칸 아래에 "GRAMMATIK 탭 있음"이 보입니다. 토큰이 필요하고, 명단과 학생 파일을 함께 바꿉니다. 이미 등록된 시험·리포트의 레벨은 바뀌지 않습니다.
- 현황 표에서 학생 이름(비밀번호가 연결된 학생)을 누르면 그 학생이 보는 화면이 열립니다. 위쪽의 "관리자 화면으로"를 누르면 불러온 현황 그대로 돌아옵니다.
- 토큰을 관리자 파일 안에 관리 비밀번호로 암호화해 넣어 둘 수 있습니다(`set-token`). 이렇게 하면 관리자 로그인만 해도 토큰을 따로 입력하지 않습니다. 토큰은 평문으로 저장소나 페이지에 넣지 않습니다. 저장소가 공개라서 평문 토큰은 누구나 읽고 저장소를 바꿀 수 있습니다.
- 토큰은 "이 브라우저에 기억합니다"가 켜져 있으면(기본값) 이 브라우저에 저장되어 다음 로그인부터 다시 입력하지 않습니다. 지우기를 누르면 삭제됩니다.
- `index.html`은 관리자 로그인 때만 `admin.js`를 씁니다. 학생 화면은 바뀌지 않습니다.

## 학생 추가와 리포트 등록 (선생님용)

저장소 루트에서 실행합니다. `cryptography` 패키지가 필요합니다(`pip install cryptography`). 관리자 페이지에서도 학생 추가·삭제를 할 수 있습니다.

```
python3 tools/hareport.py init-admin [--replace-legacy]   # 처음 한 번만. 관리자 파일(김종훈)과 관리 비밀번호를 만듭니다.
python3 tools/hareport.py new-student --name 이름 --level B1 --admin-password 관리비밀번호 [--id 아이디] [--password 20자리비밀번호] [--grammatik]
python3 tools/hareport.py link-student --id 아이디 [--password 학생비밀번호 | --no-password] --admin-password 관리비밀번호
python3 tools/hareport.py remove-student --id 아이디 --admin-password 관리비밀번호
python3 tools/hareport.py list-students --admin-password 관리비밀번호 [--show-passwords]
python3 tools/hareport.py add-exam   --id 아이디 --password 학생비밀번호 --json exam.json
python3 tools/hareport.py add-report --id 아이디 --password 학생비밀번호 --level B1 --exam-n 2 --title "과제명" --date 2026-10-28 --html 리포트.html
python3 tools/hareport.py add-voka   --id 아이디 --password 학생비밀번호 --week 6 --level A1 --title "VOKA 6주차" --date 2026-10-19 --html VOKA6주차.html
python3 tools/hareport.py enroll-grammatik --id 아이디 --password 학생비밀번호
python3 tools/hareport.py add-grammatik    --id 아이디 --password 학생비밀번호 --n 1 --title "과제명" --date 2026-11-04 --rate 87 --html 리포트.html
python3 tools/hareport.py show       --id 아이디 --password 학생비밀번호
```

- 비밀번호는 기본이 자동 생성입니다. 이미 정한 20자리 비밀번호가 있으면 `--password`로 줍니다.
- 아이디는 기본이 이름입니다. 같은 이름이 두 명이면 `--id`로 다른 아이디(예: 김민서2)를 줍니다.
- 시험과 리포트는 레벨(A2, B1, B2, GRAMMATIK, ZERTIFIKAT B1, ZERTIFIKAT B2)별로 저장하고, 화면과 관리자 페이지의 레벨 목록에는 A1이 없습니다(이미 A1로 올린 VOKA 자료 때문에 CLI는 `--level A1`을 계속 받습니다). 회차 번호는 레벨 안에서 셉니다. `exam.json`의 `level`과 `add-report`의 `--level`을 생략하면 학생의 기본 레벨로 저장합니다. 같은 레벨에서 같은 회차를 다시 올리면 덮어쓰고, 레벨이 다르면 회차가 같아도 따로 저장합니다.
- 접속(아이디, 비밀번호)은 레벨과 관계없습니다. 로그인 화면에는 레벨이 나오지 않고, 로그인한 뒤에만 레벨 버튼이 보입니다.
- VOKA 리포트는 로그인 후 위쪽 "VOKA" 탭에 주차별로 보입니다. `add-voka`는 같은 레벨에서 같은 주차를 다시 올리면 덮어씁니다. 과제 첨삭 기록 없이 VOKA만 있는 학생은 VOKA 탭이 먼저 열립니다.
- 문법반 학생에게는 로그인 후 "GRAMMATIK" 탭이 하나 더 보입니다. `enroll-grammatik`으로 탭을 켜면(리포트 0개) "GRAMMATIK 리포트가 아직 없습니다"로 보이고, `add-grammatik`으로 등록한 리포트가 회차 순서로 나타납니다. 같은 번호를 다시 올리면 덮어씁니다. `--rate`(그 회차 정답률, %)를 함께 올리면 정답률이 2회 이상 쌓인 뒤부터 GRAMMATIK 탭 위쪽에 회차별 정답률과 최근 3회 평균을 보여 주는 "실력 향상도" 그래프가 나타납니다. 새 학생은 `new-student`에 `--grammatik`을 붙여도 됩니다. 탭을 켜지 않은 학생에게는 GRAMMATIK 탭이 보이지 않습니다. 과제 첨삭과 VOKA 기록이 없는 문법반 학생은 GRAMMATIK 탭이 먼저 열립니다.
- 아이디는 NFKC 정규화 후 공백을 없애고 소문자로 바꿔 비교합니다.

`exam.json` 형식(점수는 백분율, 측정하지 않은 영역은 null):

```
{"n":2,"date":"2026-10-28","title":"과제명","level":"B1",
 "scores":{"grammar":80,"satz":100,"vocab":80,"reading":70,"listening":60,"writing":65},
 "raw":{"grammar":[16,20],"satz":[10,10],"vocab":[16,20],"reading":[7,10],"listening":[6,10]}}
```

같은 학생의 다음 시험은 같은 비밀번호로 `add-exam`과 `add-report`를 실행합니다.
