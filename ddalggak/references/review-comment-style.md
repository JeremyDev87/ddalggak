# Review Comment Style Contract
Use when: `review`가 inline finding·top-level comment 본문을 작성하는 게시 직전 단계.
Required by: cross-review-loop finding signal gate (on-demand pointer)
Side effects: none
Do not use when: 게시 없는 read-only 판단.

독자는 reference를 읽지 않은 PR 저자다. 바로 고칠 수 있게 쓴다.

## 공개 finding 문체 계약

- 평문 한 줄에 정확히 두 문장: 첫 문장은 실패와 영향, 둘째 문장은 수정과 검증이다.
- `severity`, `confidence`, `candidate`, `evidence-gap`, `gate`는 쓰지 않는다.
- 의미 슬롯이 빠지거나 불확실하면 줄이지 말고 `UNRENDERABLE`로 막는다.
- suggestion은 단일 치환과 focused validation이 확인된 경우에만 허용한다.

예: "공급자가 timeout되면 실패를 빈 결과로 바꿔 호출자가 정상적인 결과 없음으로 처리합니다. 명시적 실패를 반환하고 timeout 회귀 테스트를 실행하세요."

| 내부 용어 | 코멘트 표현 |
|---|---|
| evidence-gap | 검증 자료가 없다 |
| verdict / blockers | 결론 / 머지를 막는 문제 N건 |
| head SHA | 이 리뷰가 본 커밋 |
| gate·완료 신호 | 본문에 쓰지 않는다 |

## 변환 예시

전: "이 스킬 문화가 '명령 재구성 금지'인 만큼, 명령·서술 불일치는 자동 실행 에이전트가 무관한 tidy 브랜치 존재만으로 후보를 skip하는 오판 소지가 있습니다."

후: "이 명령을 그대로 실행하면 무관한 브랜치까지 걸립니다. 그러면 에이전트가 멀쩡한 후보를 건너뜁니다. 패턴에 `<kebab-대상명>`을 넣어 좁히는 것을 제안합니다."
