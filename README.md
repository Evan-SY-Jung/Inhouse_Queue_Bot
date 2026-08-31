# CR 내전 참여 대기열 Discord 봇

Discord 서버에서 협곡·아람 내전을 즉시 또는 예약 시간으로 모집하고, 최대 40명의 명단과 Riot 티어 기반 웹 팀 편성을 관리하는 봇입니다.

## 구현된 기능

- 관리자 전용 `/내전 세팅`
  - 필수 모달로 카테고리 ID 입력
  - 잘못된 ID, 일반 채널 ID, 권한 부족을 비공개 오류 메시지로 안내
  - 같은 카테고리 안에 `👊ㆍ내전-만들기` 채널과 코어 임베드 생성
  - 코어 임베드는 고정하지 않으며, 기존에 봇이 고정했던 코어 임베드도 재시작 시 해제
- 코어 임베드 버튼
  - `협곡 내전 모집`
  - `아람 내전 모집`
- 생성 제한
  - 한 사용자가 서버별로 협곡 모집 1개, 아람 모집 1개를 동시에 열 수 있음
  - 외부인용 `내전` 역할 보유자는 협곡·아람 모집을 생성할 수 없음
  - 모집 채널이 삭제되면 다시 생성 가능
- 협곡·아람 모집 모달
  - 누른 버튼으로 게임 종류가 정해지므로 별도 게임 선택란 없음
  - 날짜(`MM/DD/YYYY`), 시간(`HH:mm`), 타임존(`PST`/`EST`/`CST`/`MT`)은 각각 선택 사항
  - 설명은 선택 사항
  - 날짜·시간·타임존을 모두 비우면 즉시 모집 문구 사용
  - 세 항목 중 1~2개만 입력하면 비공개 오류 메시지로 완전한 예약 정보 입력을 요청
  - 세 항목을 모두 입력하면 예약 문구와 Discord 현지 시간 타임스탬프 사용
  - 예약 정보를 넣어도 채널 이름은 협곡/아람 대기열 형식을 유지
- 모집 채널
  - 즉시 모집 이름: `🏠ㆍ협곡대기열🄐`, `🏠ㆍ아람대기열🄐`
  - 협곡과 아람은 번호를 따로 계산하며, 각 종류에서 현재 열린 방만 기준으로 가장 작은 빈 순번을 다시 사용
  - 순번 문자는 `🄐`부터 `🅉`까지 지원하고, 27번째부터는 `❨27❩` 형식으로 표시
  - 협곡 임베드는 초록색, 아람 임베드는 파란색
  - 모집 임베드를 처음 전송할 때 임베드 밖 채팅 내용으로 `||@here||`를 한 번 멘션
  - 관리자와 봇 외에는 상위 채널에 메시지를 보낼 수 없음
  - 모집 임베드에서 `💬ㆍ내전 채팅` 공개 쓰레드를 자동 생성하며, 채널을 볼 수 있는 사람은 쓰레드에서 채팅 가능
- 모집 임베드
  - 1~10명, 11~20명은 첫 번째 행에 표시
  - 21명부터 세 번째 명단이 완전히 다음 행으로 내려가며, 31명부터 네 번째 명단이 그 옆에 표시
  - 최대 40명까지 받고 41번째 신청부터 비공개 오류로 거절
  - 참가/이탈 때 즉시 메시지 갱신
  - 첫 행: `신청하기`, `쫄튀하기`, `마감하기`(마감 후 `재오픈`), `팀 짜기`, `삭제`
  - 둘째 행: `전체 멘션`, `전체 소환`
- 신청과 라이엇 ID
  - 외부인용 `내전` 역할(`1412726855517081701`) 또는 `신입` 역할(`721919159780507749`)은 신청 버튼을 누르면 라이엇 닉네임과 태그를 필수로 입력하는 모달 표시
  - 위 두 역할이 없는 정멤·관리자 등은 모달 없이 바로 신청
  - `내전` 역할 보유자는 `신청하기`와 `쫄튀하기` 외 버튼을 사용할 수 없음
  - 라이엇 ID는 해당 모집 대기열에만 저장되며 채널 삭제 시 함께 삭제
- 마감과 팀 편성
  - 모집 생성자, Discord 관리자 또는 `내전관리자` 역할만 마감·재오픈과 팀 짜기 사용 가능
  - `마감하기`를 누르면 추가 신청과 이탈을 잠그고 버튼을 `재오픈`으로 변경
  - `재오픈`을 누르면 신청과 이탈을 다시 허용하고 버튼을 `마감하기`로 복원
  - 마감 후 `팀 짜기`를 누르면 누른 운영자에게만 GitHub Pages 팀 편성 링크를 비공개로 전송
  - 테스트 편의를 위해 마감 후 참가자가 1명만 있어도 편성판 생성 가능
  - 참가 인원과 관계없이 1~4번 팀을 항상 표시하며 부족한 자리는 빈자리로 유지
  - 20명 초과 인원만 편성판에서 제외
  - 정멤·관리자는 Discord 표시 이름의 맨 앞 특수문자와 맨 뒤 `실명 두자리번호`를 제외한 가운데 전체를 Riot 닉네임으로 사용
  - 예: `♣ Jindog 광진 00` → `Jindog #클로버`, `♣ Hide on study 세준 05` → `Hide on study #클로버`, `♣ 둔 기 현겸 98` → `둔 기 #클로버`
  - 신입·외부인은 신청 때 직접 입력한 Riot ID로 티어 조회
  - 솔로 랭크를 우선하고, 없으면 자유 랭크, 둘 다 없으면 언랭으로 표시
  - Riot API 키가 없거나 개별 조회가 실패해도 편성판은 열리고 해당 카드만 미조회로 표시
  - 1·2번 팀은 첫 줄, 3·4번 팀은 둘째 줄에 배치하고 남은 가로 공간에 맞춰 대기열 폭을 가장 긴 닉네임 기준으로 자동 확장
  - 모든 참가자는 처음에 대기열에 표시되며 티어 높은 순·낮은 순 정렬, 이름표 포인터 드래그, 팀 칸 자석 스냅, 세션 복구 지원
  - 참가자 데이터는 만료 시간이 있는 압축 URL 조각에만 들어가며 Riot API 키와 Discord 토큰은 웹으로 전달하지 않음
- 전체 멘션
  - 모집 생성자, Discord 관리자 또는 `내전관리자` 역할만 사용 가능
  - 대기열에 한 명 이상 있으면 사용 가능
  - 10명 이하면 대기열 전원, 11명 이상이면 선착순 10명만 멘션
  - 서버 전체 공유 10초 쿨타임이며 DB에 저장됨
  - 멘션 메시지는 전송 14초 후 자동 삭제
- 올 소환
  - 모집 생성자, 관리자 또는 `내전관리자` 역할(`1542873758770135061`)만 가능
  - 정확히 `전부 소환`을 입력하는 확인 모달
  - 음성 채널 선택 없이 고정 음성 채널 `812822837495988244`로 이동
  - 10명 미만에는 버튼이 비활성화되며 서버에서도 실행을 거절
  - 10~19명이면 선착순 10명, 20명 이상이면 선착순 20명만 소환 대상으로 지정
  - 20명을 넘는 대기자는 소환 대상에서 제외
  - 소환 대상 중 현재 서버 음성 채널에 접속한 멤버만 이동
  - 실제로 한 명 이상 이동했을 때 해당 모집에서 영구적으로 1회 사용 처리
  - 관리자와 `내전관리자`는 사용 횟수를 소모하지 않고 무제한으로 반복 사용 가능
  - 실행자, 실제 이동된 사용자, 대상 음성 채널을 모집 채널에 기록
- 삭제
  - 모집 생성자, Discord 관리자 또는 `내전관리자` 역할만 가능
  - 채널 삭제와 DB 상태 정리를 함께 수행
- 재시작 복구
  - 대기열 순서, 쿨타임, 올 소환 상태 유지
  - 봇이 꺼진 동안 삭제된 채널 정리
  - 코어/대기열 메시지가 수동 삭제된 경우 자동 재생성

## 임베드 문구와 색상 수정

임베드에 보이는 설정은 [`src/content/embedConfig.ts`](src/content/embedConfig.ts) 한 파일에서 수정합니다. 코어 패널과 협곡·아람의 즉시/예약형 임베드 모두 같은 방식입니다.

- 색상은 `0xRRGGBB` 형식입니다. 예: `0x57f287`
- `"#57f287"`, `"57f287"` 형식도 지원합니다.
- `{game}`, `{count}`, `{limit}` 같은 중괄호 토큰은 실제 게임명과 인원수로 자동 교체됩니다.
- 모든 항목은 선택 사항입니다. 필요 없는 줄이나 블록을 삭제하거나 `null`, `""`로 설정해도 오류가 나지 않습니다.
- `title`, `description`, `url`, `color`, `author`, `footer`, `thumbnail`, `image`, `fields`, `timestamp`를 자유롭게 추가할 수 있습니다.
- `icon_url`과 `iconURL` 중 어느 쪽을 사용해도 됩니다.
- 알 수 없는 추가 항목이나 잘못된 URL·색상·빈 객체는 봇을 중단시키지 않고 안전하게 무시합니다.
- `recruitment.queue` 블록을 삭제하면 자동 대기열 명단 자체가 임베드에서 숨겨집니다. 블록 안의 개별 이름이나 빈 명단 문구만 삭제하는 것도 가능합니다.

```ts
footer: {
  text: "Some footer text here",
  icon_url: "https://i.imgur.com/AfFp7pu.png",
},
```

표준 항목 추가 예시:

```ts
author: {
  name: "CR Clan",
  icon_url: "https://example.com/avatar.png",
},
thumbnail: {
  url: "https://example.com/thumbnail.png",
},
fields: [
  { name: "안내", value: "내전 안내 내용", inline: false },
],
```

로컬 수정 중에는 아래 명령으로 실행하면 파일 저장 시 자동 재시작되므로 Docker 재빌드가 필요 없습니다.

```bash
npm run dev
```

운영 Docker 이미지로 실행 중이라면 소스가 이미지 안에 포함되므로 변경 후 이미지를 다시 빌드해야 합니다.

## 프로젝트 구조

- `src/content/embedConfig.ts` — 사용자가 수정하는 임베드 디자인과 문구
- `src/content/embedTypes.ts` — 모든 선택형 임베드 설정 타입과 이전 버전 호환 타입
- `src/discord/embedRenderer.ts` — 빈 값, 잘못된 URL, 글자·필드 제한을 안전하게 처리하는 공통 렌더러
- `src/discord/embeds.ts` — 예약 시간, 게임 정보, 실시간 대기열 토큰 조립
- `src/discord/messagePayloads.ts` — 코어/모집 메시지 payload 생성 중앙화
- `src/discord/DiscordStateService.ts` — 메시지 갱신, 삭제된 메시지 복구, 재시작 상태 동기화
- `src/discord/BotController.ts` — Discord 명령어·버튼·모달 흐름 제어
- `src/discord/constants.ts` — 고정 소환 음성 채널 ID와 공통 Discord 설정
- `src/discord/voiceSummon.ts` — 음성 채널 이동과 결과 집계
- `src/services/queuePresentation.ts` — 참가 순번과 멘션·소환 선착순 대상 계산
- `src/services/riotId.ts` — 모집별 라이엇 닉네임·태그 검증
- `src/services/riotApi.ts` — Account/League API 티어 조회, 속도 제한, 메모리 캐시
- `src/services/teamBuilder.ts` — 정멤 Riot ID 해석과 Discord 프로필·티어가 포함된 압축형 팀 편성 링크 생성
- `src/services/teamFormation.ts` — 선착순 10/20명의 무작위 5:5 팀 편성
- `src/db/sqliteSchema.ts` — SQLite 스키마와 마이그레이션
- `src/db/sqliteRepository.ts` — DB 읽기·쓰기와 트랜잭션
- `web/` — GitHub Pages용 드래그 팀 편성 화면(정적 HTML/CSS/JavaScript)
- `.github/workflows/pages.yml` — `web/` 자동 GitHub Pages 배포

## 요구 환경

- Node.js 24 이상
- Discord 애플리케이션과 Bot Token
- 봇을 실행할 Linux/Windows 서버 또는 Docker

이 프로젝트는 Node.js 내장 SQLite를 사용하므로 별도 DB 서버 없이 바로 실행할 수 있습니다. DB 접근은 `RecruitmentRepository` 인터페이스로 분리되어 있어 나중에 PostgreSQL/MySQL 어댑터로 교체할 수 있습니다.

## Discord 애플리케이션 준비

Discord Developer Portal에서 애플리케이션과 봇을 만든 뒤 OAuth2 URL Generator로 서버에 초대합니다.

선택할 Scope:

- `bot`
- `applications.commands`

봇 권한:

- View Channels
- Manage Channels
- Manage Roles — 모집 채널의 읽기 전용 권한 덮어쓰기용
- Send Messages
- Embed Links
- Mention @everyone, @here, and All Roles — 모집 생성 시 `@here` 알림용
- Read Message History
- Create Public Threads
- Send Messages in Threads
- Manage Threads
- Manage Messages — 모집 대기열 임베드 고정을 원할 때만 필요; 코어 임베드는 고정하지 않음
- Move Members
- Connect

`Guilds`와 `Guild Voice States` 인텐트만 사용하며, Message Content나 Guild Members 같은 Privileged Intent는 필요하지 않습니다.

## 로컬 실행

```bash
npm install
cp .env.example .env
```

`.env`에 아래 값을 채웁니다.

```dotenv
DISCORD_TOKEN=봇_토큰
DISCORD_CLIENT_ID=애플리케이션_ID
DISCORD_GUILD_ID=테스트_서버_ID
DATABASE_PATH=./data/cr-inhouse.sqlite
CALL_SIZE=10
MENTION_COOLDOWN_SECONDS=10
RIOT_API_KEY=Riot_Developer_Portal_API_키
RIOT_REGIONAL_ROUTE=americas
RIOT_PLATFORM_ROUTE=na1
RIOT_RANK_CACHE_MINUTES=15
MEMBER_RIOT_TAG=클로버
TEAM_BUILDER_BASE_URL=https://evan-sy-jung.github.io/Inhouse_Queue_Bot/
TEAM_BUILDER_SESSION_MINUTES=60
```

토큰은 채팅, Git, 스크린샷에 노출하지 마세요. 노출되었다면 Developer Portal에서 즉시 재발급해야 합니다.

`RIOT_API_KEY`는 [Riot Developer Portal](https://developer.riotgames.com/)에서 발급합니다. 개발용 키는 만료될 수 있으므로 운영 중 티어가 전부 `API 미설정` 또는 `조회 실패`로 보이면 키 상태부터 확인하세요. 키를 비워도 기존 모집·신청·소환 기능과 수동 팀 편성판은 계속 동작합니다.

현재 공식 League-V4 응답은 현재 랭크만 제공하므로 과거 모든 시즌을 소급한 최고 티어는 표시하지 않습니다. 이후 조회된 최고 기록을 별도 DB에 누적하는 기능은 추가할 수 있습니다.

테스트 서버에 Slash Command를 등록하고 봇을 시작합니다.

```bash
npm run deploy:commands:dev
npm run dev
```

`DISCORD_GUILD_ID`가 있으면 해당 서버에만 등록되어 즉시 반영됩니다. 실제 운영 전환 시 이 값을 비우고 `npm run deploy:commands:dev`를 다시 실행하면 전역 명령어로 등록됩니다.

## GitHub Pages 팀 편성판 배포

정적 화면은 같은 저장소의 `web/`에 있으며 `main`에 변경이 푸시되면 `.github/workflows/pages.yml`이 자동 배포합니다. 최초 한 번만 GitHub 저장소에서 아래 설정이 필요합니다.

1. GitHub 저장소의 **Settings** → **Pages**로 이동합니다.
2. **Build and deployment**의 **Source**를 **GitHub Actions**로 선택합니다.
3. **Actions** 탭의 `Deploy team builder to GitHub Pages` 실행이 성공했는지 확인합니다.
4. 공개 주소 `https://evan-sy-jung.github.io/Inhouse_Queue_Bot/`가 열리는지 확인합니다.

다른 주소를 사용하면 봇 서버의 `TEAM_BUILDER_BASE_URL`도 같은 주소로 바꿔야 합니다. 웹페이지는 Riot API나 Discord API를 직접 호출하지 않습니다. 봇 프로세스가 티어와 Discord 프로필 식별 정보를 준비한 뒤, 최대 20명의 표시용 데이터만 브라우저에서 해제하는 URL 조각(`#s=...`)으로 전달합니다. 프로필 이미지는 브라우저가 Discord CDN에서 불러오며 토큰과 API 키는 링크에 포함되지 않습니다. 링크를 받은 사람은 참가자 정보를 볼 수 있으므로 공개 채널에 링크 자체를 다시 올리지 않는 것이 좋습니다.

## Docker 실행

```bash
cp .env.example .env
docker compose build
docker compose run --rm cr-inhouse-bot npm run deploy:commands
docker compose up -d
docker compose logs -f
```

DB 파일은 호스트의 `./data` 폴더에 유지됩니다.

## 서버에서 사용하는 법

1. Discord 설정 → 고급 → 개발자 모드를 켭니다.
2. 모집 채널을 둘 카테고리를 우클릭해 ID를 복사합니다.
3. 관리자가 `/내전 세팅`을 실행하고 카테고리 ID를 입력합니다.
4. 생성된 `👊ㆍ내전-만들기` 채널의 버튼으로 모집을 엽니다.
5. 예약하려면 협곡/아람 모집 모달에서 날짜·시간·타임존을 모두 입력합니다. `PST`/`EST`/`CST`/`MT`는 해당 미국 지역의 서머타임을 자동 반영합니다.

`올 소환` 대상은 `src/discord/constants.ts`의 `SUMMON_VOICE_CHANNEL_ID`로 고정됩니다. 현재 값은 `812822837495988244`이며, 봇에는 해당 음성 채널의 보기·연결·멤버 이동 권한이 필요합니다.

## 검사 명령어

```bash
npm run typecheck
npm run check:web
npm test
npm run build
```

자동 테스트는 DB 생성 제한과 기존 DB 마이그레이션, 게임별 열린 채널 순번 재사용, 최초 `@here` 알림, 선택형 예약 입력 조합, 40명 상한과 2행 명단, 선택형 라이엇 ID 저장·삭제, 신청 마감·재오픈, 생성자·관리자·내전관리자 권한과 내전 역할 제한, 10/20명 소환 대상 제한, 관리자 무제한 소환 권한, Riot API 조회·캐시·실패 격리, 공백을 포함한 정멤/신입 Riot ID 해석, 압축 팀 편성 링크, 티어·디비전·LP 정렬, 5:5 팀 편성, 중복 참가, 서버 쿨타임, 임베드 항목 추가·삭제·빈 설정·이전 버전 호환, 모달 셀렉트와 채널 권한, 버튼 ID 라우팅을 검사합니다.

실제 Discord 서버에서 확인할 항목은 [docs/LIVE_TEST_CHECKLIST.md](docs/LIVE_TEST_CHECKLIST.md)에 정리되어 있습니다.

## DB 교체 지점

- 계약: `src/db/repository.ts`
- 현재 SQLite 구현: `src/db/sqliteRepository.ts`
- Discord 로직: `src/discord/BotController.ts`

외부 DB를 붙일 때 `RecruitmentRepository`의 새 구현을 만든 뒤 `src/index.ts`에서 주입하는 객체만 교체하면 됩니다. 여러 봇 인스턴스를 동시에 실행할 계획이라면 DB의 고유 인덱스와 트랜잭션/행 잠금을 동일하게 보장해야 합니다.
