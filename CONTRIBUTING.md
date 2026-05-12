# ddalggak 기여 가이드

## Issue First

버그 리포트, 기능 요청, 질문은 먼저 [GitHub Issue](https://github.com/JeremyDev87/ddalggak/issues)를 열어주세요. 코드 변경 전에 이슈에서 먼저 논의합니다.

## Fork & Pull Request

1. 이 레포를 Fork합니다
2. 기능 브랜치를 만듭니다: `git checkout -b feature/my-feature`
3. 변경 사항을 커밋합니다: `git commit -m "feat: add my feature"`
4. Fork한 레포에 Push합니다: `git push origin feature/my-feature`
5. Pull Request를 열어주세요

## CLI 변경 검증

`bin/ddalggak.js`, `bin/lib/setup.mjs`, `bin/lib/dispatch.mjs`처럼 setup 또는 dispatch 동작을 바꾸는 PR은 반드시 `npm test`를 실행해 통과시켜야 합니다.

동작이 추가되거나 바뀌면 `scripts/smoke.mjs`에 스모크 케이스도 함께 추가하세요. CLI 변경 시점에 `npm test` 또는 `scripts/smoke.mjs`가 없다면, 해당 PR에서 테스트 스크립트와 스모크 하네스를 먼저 추가하거나 복구한 뒤 아래 절차를 따릅니다.

1. 새 케이스가 실행할 명령과 기대 종료 코드를 정합니다.
2. stdout/stderr에서 반드시 유지되어야 하는 핵심 문구를 검증합니다.
3. 파일시스템을 바꾸는 setup 케이스는 임시 `CLAUDE_HOME` 또는 `--target`을 사용하고, 실제 사용자 `~/.claude`를 건드리지 않습니다.
4. 실패 경로를 추가했다면 에러 메시지와 종료 코드도 함께 검증합니다.
5. 마지막으로 `npm test`로 전체 스모크 케이스를 실행합니다.

## Contact

메인테이너: [@JeremyDev87](https://github.com/JeremyDev87)
