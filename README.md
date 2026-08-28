# CR 내전 참여 대기열 Discord 봇

Discord 서버에서 협곡·아람 즉시 모집과 관리자 전용 예약 모집을 만들고, 10명 단위 내전 명단과 20명 이후 대기자를 실시간 임베드로 관리하는 봇입니다.

## 구현된 기능

- 관리자 전용 `/내전 세팅`
  - 필수 모달로 카테고리 ID 입력
  - 잘못된 ID, 일반 채널 ID, 권한 부족을 비공개 오류 메시지로 안내
  - 같은 카테고리 안에 `👊ㆍ내전-만들기` 채널과 코어 임베드 생성
  - 코어 임베드는 고정하지 않으며, 기존에 봇이 고정했던 코어 임베드도 재시작 시 해제
- 코어 임베드 버튼
  - `협곡 내전 모집`
  - `아람 내전 모집`
  - `내전 예약`
- 생성 제한
  - 한 사용자가 서버별로 협곡 즉시 모집 1개, 아람 즉시 모집 1개, 예약 모집 1개를 동시에 열 수 있음
  - 예약 모집 생성은 관리자만 가능
  - 모집 채널이 삭제되면 다시 생성 가능
- 협곡·아람 즉시 모집 모달
  - 시작까지 남은 시간은 `10`, `15`, `20`, `30`, `45`, `60`, `90`, `120`분 중 선택
  - 시작 시간과 설명은 모두 선택 사항
  - 시간을 선택하면 예약 모집과 같은 Discord 타임스탬프로 각 사용자의 현지 시간이 표시됨
  - 시간을 선택하지 않으면 기존 즉시 모집 임베드처럼 시간 없이 생성됨
- 예약 모달
  - 게임 종류: `협곡`/`아람` 셀렉트 메뉴
  - 날짜: `MM/DD/YYYY`
  - 시간: `HH:mm` 또는 `HH/mm`, 24시간제
  - 타임존: `PST`, `EST`, `CST`, `MT` 셀렉트 메뉴
  - 설명은 선택 사항
  - 예약 시간은 Discord 타임스탬프로 표시되어 각 사용자의 앱 현지 시간으로 보임
- 모집 채널
  - 즉시 모집 이름: `🏠ㆍ협곡대기열🄐`, `🏠ㆍ아람대기열🄐`
  - 협곡과 아람은 번호를 따로 계산하며, 각 종류에서 현재 열린 방만 기준으로 가장 작은 빈 순번을 다시 사용
  - 순번 문자는 `🄐`부터 `🅉`까지 지원하고, 27번째부터는 `❨27❩` 형식으로 표시
  - 예약 모집 이름: `⏰ㆍ협곡예약❨12∕31❩`, `⏰ㆍ아람예약❨12∕31❩`
  - 협곡 임베드는 초록색, 아람 임베드는 파란색
  - 모집 임베드를 처음 전송할 때 임베드 밖 채팅 내용으로 `||@here||`를 한 번 멘션
  - 관리자와 봇 외에는 상위 채널에 메시지를 보낼 수 없음
  - 모집 임베드에서 `💬ㆍ내전 채팅` 공개 쓰레드를 자동 생성하며, 채널을 볼 수 있는 사람은 쓰레드에서 채팅 가능
- 모집 임베드
  - 9명까지는 `현재 인원/10`만 표시
  - 10명이 되면 `현재 인원/20` 명단이 추가되고, 20명이 되면 `대기자` 칸이 추가됨
  - 20명을 넘겨도 참가를 계속 받고 선착순을 유지
  - 참가/이탈 때 즉시 메시지 갱신
  - `참가`, `도망가기`, `올 멘션`, `올 소환`, `삭제`, 비활성 `관리 (준비 중)` 버튼
- 올 멘션
  - 대기열에 한 명 이상 있으면 사용 가능
  - 10명 이하면 대기열 전원, 11명 이상이면 선착순 10명만 멘션
  - 서버 전체 공유 10초 쿨타임이며 DB에 저장됨
  - 멘션 메시지는 전송 14초 후 자동 삭제
- 올 소환
  - 모집 생성자 또는 관리자만 가능
  - 정확히 `전부 소환`을 입력하는 확인 모달
  - 음성 채널 선택 없이 고정 음성 채널 `812822837495988244`로 이동
  - 10명 미만에는 버튼이 비활성화되며 서버에서도 실행을 거절
  - 10~19명이면 선착순 10명, 20명 이상이면 선착순 20명만 소환 대상으로 지정
  - 20명을 넘는 대기자는 소환 대상에서 제외
  - 소환 대상 중 현재 서버 음성 채널에 접속한 멤버만 이동
  - 실제로 한 명 이상 이동했을 때 해당 모집에서 영구적으로 1회 사용 처리
  - 실행자, 실제 이동된 사용자, 대상 음성 채널을 모집 채널에 기록
- 삭제
  - 모집 생성자 또는 관리자만 가능
  - 채널 삭제와 DB 상태 정리를 함께 수행
- 재시작 복구
  - 대기열 순서, 쿨타임, 올 소환 상태 유지
  - 봇이 꺼진 동안 삭제된 채널 정리
  - 코어/대기열 메시지가 수동 삭제된 경우 자동 재생성

## 임베드 문구와 색상 수정

임베드에 보이는 설정은 [`src/content/embedConfig.ts`](src/content/embedConfig.ts) 한 파일에서 수정합니다. 코어 패널과 협곡·아람·예약 모집 임베드 모두 같은 방식입니다.

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
- `src/services/immediateStart.ts` — 즉시 모집 시작 분 옵션 검증과 예정 시각 계산
- `src/services/queuePresentation.ts` — 참가 순번과 멘션·소환 선착순 대상 계산
- `src/db/sqliteSchema.ts` — SQLite 스키마와 마이그레이션
- `src/db/sqliteRepository.ts` — DB 읽기·쓰기와 트랜잭션

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
QUEUE_CAPACITY=20
CALL_SIZE=10
MENTION_COOLDOWN_SECONDS=10
```

토큰은 채팅, Git, 스크린샷에 노출하지 마세요. 노출되었다면 Developer Portal에서 즉시 재발급해야 합니다.

테스트 서버에 Slash Command를 등록하고 봇을 시작합니다.

```bash
npm run deploy:commands:dev
npm run dev
```

`DISCORD_GUILD_ID`가 있으면 해당 서버에만 등록되어 즉시 반영됩니다. 실제 운영 전환 시 이 값을 비우고 `npm run deploy:commands:dev`를 다시 실행하면 전역 명령어로 등록됩니다.

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
5. 예약은 관리자만 만들 수 있으며, `PST`/`EST`/`CST`/`MT` 중 지역을 선택합니다. 각 옵션은 해당 미국 지역의 서머타임을 자동 반영합니다.

`올 소환` 대상은 `src/discord/constants.ts`의 `SUMMON_VOICE_CHANNEL_ID`로 고정됩니다. 현재 값은 `812822837495988244`이며, 봇에는 해당 음성 채널의 보기·연결·멤버 이동 권한이 필요합니다.

## 검사 명령어

```bash
npm run typecheck
npm test
npm run build
```

자동 테스트는 DB 생성 제한과 게임별 열린 채널 순번 재사용, 즉시 모집 시작 시간, 최초 `@here` 알림, 10/20명 소환 대상 제한, 무제한 대기열 순서, 중복 참가, 서버 쿨타임, 1회 소환 잠금, 예약 시간/타임존, 단계별 임베드 명단, 임베드 항목 추가·삭제·빈 설정·이전 버전 호환, 모달 셀렉트와 채널 권한, 버튼 ID 라우팅을 검사합니다.

실제 Discord 서버에서 확인할 항목은 [docs/LIVE_TEST_CHECKLIST.md](docs/LIVE_TEST_CHECKLIST.md)에 정리되어 있습니다.

## DB 교체 지점

- 계약: `src/db/repository.ts`
- 현재 SQLite 구현: `src/db/sqliteRepository.ts`
- Discord 로직: `src/discord/BotController.ts`

외부 DB를 붙일 때 `RecruitmentRepository`의 새 구현을 만든 뒤 `src/index.ts`에서 주입하는 객체만 교체하면 됩니다. 여러 봇 인스턴스를 동시에 실행할 계획이라면 DB의 고유 인덱스와 트랜잭션/행 잠금을 동일하게 보장해야 합니다.
