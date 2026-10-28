# HA-REPORT

Sophia Deutsch Akademie 과제 첨삭 리포트 열람 페이지입니다.

- 열람 방법: 아이디(이름)와 비밀번호 20자리를 입력해 로그인하면 자신의 발전 기록 그래프와 리포트가 열립니다. 로그인한 뒤 A2 · B1 · B2 버튼으로 레벨을 골라 그 레벨의 기록과 리포트를 봅니다.
- 학생마다 비밀번호가 다릅니다. 비밀번호는 이 저장소에 없습니다.
- 리포트와 시험 기록은 `data/{파일 id}.bin`에 암호화되어 있습니다(PBKDF2-SHA256 600000회, AES-256-GCM). 파일 id는 아이디에서 계산한 값이라 저장소만 봐서는 누가 등록되어 있는지 알 수 없습니다.
- 가짜 파일이 섞여 있어 파일 수로 학생 수를 알 수 없고, 전체 파일 수는 20개 단위로 늘어납니다. `data/admin.bin`은 가짜 파일 목록으로, 관리 비밀번호로만 열립니다.
- 화면에는 이름 목록, 레벨 목록, 학생 수가 없습니다.

## 학생 추가와 리포트 등록 (선생님용)

저장소 루트에서 실행합니다. `cryptography` 패키지가 필요합니다(`pip install cryptography`).

```
python3 tools/hareport.py init-admin           # 처음 한 번만. 관리 비밀번호를 만듭니다.
python3 tools/hareport.py new-student --name 이름 --level B1 --admin-password 관리비밀번호 [--id 아이디]
python3 tools/hareport.py add-exam   --id 아이디 --password 학생비밀번호 --json exam.json
python3 tools/hareport.py add-report --id 아이디 --password 학생비밀번호 --level B1 --exam-n 2 --title "과제명" --date 2026-10-28 --html 리포트.html
python3 tools/hareport.py show       --id 아이디 --password 학생비밀번호
```

- 아이디는 기본이 이름입니다. 같은 이름이 두 명이면 `--id`로 다른 아이디(예: 김민서2)를 줍니다.
- 시험과 리포트는 레벨(A1, A2, B1, B2)별로 저장하고, 회차 번호는 레벨 안에서 셉니다. `exam.json`의 `level`과 `add-report`의 `--level`을 생략하면 학생의 기본 레벨로 저장합니다. 같은 레벨에서 같은 회차를 다시 올리면 덮어쓰고, 레벨이 다르면 회차가 같아도 따로 저장합니다.
- 접속(아이디, 비밀번호)은 레벨과 관계없습니다. 로그인 화면에는 레벨이 나오지 않고, 로그인한 뒤에만 레벨 버튼이 보입니다.
- 아이디는 NFKC 정규화 후 공백을 없애고 소문자로 바꿔 비교합니다.

`exam.json` 형식(점수는 백분율, 측정하지 않은 영역은 null):

```
{"n":2,"date":"2026-10-28","title":"과제명","level":"B1",
 "scores":{"grammar":80,"satz":100,"vocab":80,"reading":70,"listening":60,"writing":65},
 "raw":{"grammar":[16,20],"satz":[10,10],"vocab":[16,20],"reading":[7,10],"listening":[6,10]}}
```

같은 학생의 다음 시험은 같은 비밀번호로 `add-exam`과 `add-report`를 실행합니다.
