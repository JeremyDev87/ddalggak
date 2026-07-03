# Review Comment Style Contract
Use when: `review`가 inline finding·top-level comment 본문을 작성하는 게시 직전 단계.
Required by: cross-review-loop finding signal gate (on-demand pointer)
Side effects: none
Do not use when: 게시 없는 read-only 판단.

독자는 ddalggak reference를 한 줄도 읽지 않은 PR 저자다. 코멘트는 그 독자가 한 번 읽고 바로 고칠 수 있어야 한다.

## 규칙

1. 첫 문장은 이 코드에 무슨 일이 생기는지 평문으로 쓴다. 시스템 어휘를 쓰지 않는다.
2. 순서를 고정한다: 증상 → 근거(파일:라인, 실측값) → 제안. 결론을 뒤로 미루지 않는다.
3. 한 문장에 절 하나. 삽입 괄호는 문장당 1개까지.
4. 명사구로 끝내지 않는다. "~할 소지", "~위험" 대신 무슨 일이 생기는지 동사로 쓴다.
5. 내부 용어는 독자 언어로 바꾼다.

| 내부 용어 | 코멘트에 쓸 표현 |
|---|---|
| evidence-gap | 검증 자료가 없다 |
| verdict / blockers | 결론 / 머지를 막는 문제 N건 |
| head SHA | 이 리뷰가 본 커밋 |
| gate 이름·완료 신호명 | 본문에 쓰지 않는다 (트레일러 줄 제외) |

## 변환 예시

전: "이 스킬 문화가 '명령 재구성 금지'인 만큼, 명령·서술 불일치는 자동 실행 에이전트가 무관한 tidy 브랜치 존재만으로 후보를 skip하는 오판 소지가 있습니다."

후: "이 명령을 그대로 실행하면 무관한 브랜치까지 걸립니다. 그러면 에이전트가 멀쩡한 후보를 건너뜁니다. 패턴에 `<kebab-대상명>`을 넣어 좁히는 것을 제안합니다."
