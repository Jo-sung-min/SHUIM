# 철학 문장 초기 콘텐츠와 검수 기준

출처 확인일: 2026-11-04. 초기 시드는 `backend/src/main/resources/db/migration/V27__seed_philosophy_quotes.sql`이며, 고전 4작품에서 각 6개씩 총 24개를 수록한다. 이 문서는 출처 조사 기록이며 관리자 승인 기록이 아니다.

## 의역 표시

24개 모두 `kind=paraphrase`다. **한국어로 사상을 풀어쓴 문장**이며, 저자가 한국어 문장 그대로 말하거나 썼다는 뜻이 아니다. UI와 AI 응답에서도 저자·저서·장절 및 의역 표시를 함께 유지한다. 직인용을 뜻하는 따옴표와 함께 저자의 실제 발언으로 소개하지 않는다. `translation`이나 출처 없는 유명 어록으로 바꾸지 않는다.

관리자의 문장 구분에서 **의역(`paraphrase`)**은 사상을 새 문장으로 풀어 쓴 경우이고, **번역(`translation`)**은 특정 원문 구절을 한국어로 옮긴 경우다. 원문 인용에 해당하는 번역은 실제 구절과 번역 출처·권리를 검수해야 한다. 의역에 원문 인용이라는 표시를 붙이거나 두 종류를 섞지 않는다. 현재 시드에는 번역 항목이 없다.

현대 한국어 번역서의 문장을 옮기지 않았다. 오래된 원전의 선택한 논지를 짧은 한국어로 새로 풀었으며, 해당 작품 전체의 주장이나 문맥을 모두 요약한 것은 아니다. 휴식과 관계를 돕는 문장이라는 편집 목적 때문에 원문의 명령형을 완화했으나, 저자가 하지 않은 성공 보장이나 심리 진단을 덧붙이지 않는다.

## 확인한 본문과 저자 표기

| 작품 | 확인한 본문 | 저자·판본상의 주의점 |
| --- | --- | --- |
| 도덕경 | [Wikisource 한문 본문](https://wikisource.org/wiki/Dao_De_Jing), [정통도장 수록 도덕진경 대조본](https://zh.wikisource.org/wiki/%E9%81%93%E5%BE%B7%E7%9C%9F%E7%B6%93) | 고대 한문 고전. 단일 저자의 친필 저술로 단정하지 않고 `노자(전승)`으로 표기한다. 통행본의 81장 번호를 사용한다. |
| 논어 | [국립성공대학교 도메인의 한문 전문](https://stli.iim.ncku.edu.tw/chinese/Confucius.html), [James Legge 고전 번역 대조본](https://www.gutenberg.org/cache/epub/3330/pg3330-images.html) | 고대에 편찬된 언행록이며 공자의 직접 집필본이라는 뜻이 아니다. 선택한 여섯 대목은 공자의 말로 기록된 부분이다. 본문은 한문을 기준으로 하고 현대 번역 문구는 사용하지 않는다. |
| 명상록 | MIT Internet Classics Archive의 George Long 번역: [4권](https://classics.mit.edu/Antoninus/meditations.4.four.html), [5권](https://classics.mit.edu/Antoninus/meditations.5.five.html), [6권](https://classics.mit.edu/Antoninus/meditations.6.six.html), [7권](https://classics.mit.edu/Antoninus/meditations.7.seven.html), [8권](https://classics.mit.edu/Antoninus/meditations.8.eight.html) | 2세기 마르쿠스 아우렐리우스의 저술. 고대 그리스어를 직접 번역했다고 표시하지 않는다. 저작권이 만료된 George Long의 고전 영어 번역을 읽고 논지를 의역했다. |
| 루킬리우스에게 보내는 편지 | [The Latin Library 라틴어 제1권 전문](https://www.thelatinlibrary.com/sen/seneca.ep1.shtml) | 1세기 세네카의 서간. 페이지의 로마숫자는 편지 번호, 대괄호 숫자는 절 번호다. 현대 한국어 번역이나 웹사이트 설명·주석을 전재하지 않는다. |

저작권 만료 고전의 사상을 대상으로 한다. George Long(1800–1879)의 저자 정보는 [미국 의회도서관의 명상록 서지](https://www.loc.gov/item/27007869/), James Legge(1815–1897)는 [Project Gutenberg의 논어 서지](https://www.gutenberg.org/ebooks/3330)에서 확인할 수 있다. 웹사이트의 현대 해설·편집물·새 번역까지 저작권이 없다고 간주하지 않는다. 원전 링크가 바뀌면 같은 장절의 본문과 판본을 다시 확인한다. 『논어』의 Legge 번역은 술이의 해당 대목을 VII.21, 자한의 해당 대목을 IX.18로 나누므로, 시드의 통행 장절 번호 7.22·9.19와 혼동하지 않는다. 두 번호는 각각 [술이 22 원문 대조](https://ctext.org/text.pl?if=en&node=1272&show=parallel), [자한 19 원문 대조](https://ctext.org/text.pl?if=en&node=1327&show=parallel)로도 확인했다.

## 문장별 검수 대조표

아래 번호는 고정 UUID `a7d48a6c-df27-4000-8000-` 뒤의 12자리 숫자에 대응한다. 예: 1번은 `a7d48a6c-df27-4000-8000-000000000001`. 사용자에게 보여줄 정확한 문장은 시드의 `text`가 기준이다. 아래는 중복 문구를 관리하지 않기 위한 장절·선택 범위 대조표다.

| 번호 | 출처 | 주제 | 확인한 사상과 의역 범위 |
| --- | --- | --- | --- |
| 1 | [도덕경 8장](https://wikisource.org/wiki/Dao_De_Jing) | 관계 | 다투지 않으면서 만물을 이롭게 하는 물의 비유. 갈등에서 무조건 양보하라는 뜻으로 확장하지 않는다. |
| 2 | [도덕경 11장](https://wikisource.org/wiki/Dao_De_Jing) | 휴식 | 바퀴·그릇·방의 빈 부분이 쓰임을 만든다는 비유에서 여백의 가치를 선택. |
| 3 | [도덕경 15장](https://wikisource.org/wiki/Dao_De_Jing) | 휴식 | 탁한 물이 고요히 가라앉아 서서히 맑아지는 대목. 기다리면 모든 문제가 해결된다는 보장은 제외. |
| 4 | [도덕경 22장](https://wikisource.org/wiki/Dao_De_Jing) | 자기수용 | 굽힘과 온전함의 역설을 유연함으로 의역. 부당한 일을 참으라는 권유로 사용하지 않는다. |
| 5 | [도덕경 64장](https://wikisource.org/wiki/Dao_De_Jing) | 작은실천 | 천 리 길과 발밑의 시작. 목표 달성 보장이나 진도 재촉은 덧붙이지 않는다. |
| 6 | [도덕경 67장](https://wikisource.org/wiki/Dao_De_Jing) | 용기 | 자애가 용기를 가능하게 한다는 부분. 전쟁·승리·천명에 대한 뒤 문장은 옮기지 않았다. |
| 7 | [논어 학이 1.1](https://stli.iim.ncku.edu.tw/chinese/Confucius.html) | 작은실천 | 배운 것을 때때로 익히는 즐거움. 공부량이나 성취를 평가하지 않는다. |
| 8 | [논어 위정 2.17](https://stli.iim.ncku.edu.tw/chinese/Confucius.html) | 자기수용 | 아는 것과 모르는 것을 솔직히 구분하는 앎. |
| 9 | [논어 술이 7.22](https://stli.iim.ncku.edu.tw/chinese/Confucius.html) | 삶 | 동행에게서 배울 점을 찾는 첫 논지. 타인의 결점을 찾으라는 지시로 바꾸지 않는다. |
| 10 | [논어 자한 9.19](https://stli.iim.ncku.edu.tw/chinese/Confucius.html) | 작은실천 | 흙 한 바구니를 보태는 것도 스스로 나아가는 일이라는 후반부. 중단에 대한 자책은 제외. |
| 11 | [논어 안연 12.16](https://stli.iim.ncku.edu.tw/chinese/Confucius.html) | 관계 | 다른 사람의 좋은 일이 이루어지도록 돕는 태도. 군자·소인의 서열 평가는 제외. |
| 12 | [논어 위령공 15.24](https://stli.iim.ncku.edu.tw/chinese/Confucius.html) | 관계 | 자신이 원하지 않는 일을 남에게 하지 않는 상호 배려. |
| 13 | [명상록 4.3](https://classics.mit.edu/Antoninus/meditations.4.four.html) | 휴식 | 자기 내면으로 돌아와 새로워지는 휴식. 여행이나 외부 도움을 낮추지 않는다. |
| 14 | [명상록 5.9](https://classics.mit.edu/Antoninus/meditations.5.five.html) | 자기수용 | 뜻대로 살지 못해도 낙담에 머물지 않고 다시 돌아오는 부분. |
| 15 | [명상록 6.48](https://classics.mit.edu/Antoninus/meditations.6.six.html) | 관계 | 주변 사람의 좋은 성품을 떠올리며 기운을 얻는 대목. |
| 16 | [명상록 7.7](https://classics.mit.edu/Antoninus/meditations.7.seven.html) | 용기 | 다른 사람의 도움을 부끄러워하지 말라는 논지. 군사적 비유와 의무 강조는 옮기지 않았다. |
| 17 | [명상록 7.8](https://classics.mit.edu/Antoninus/meditations.7.seven.html) | 용기 | 현재 쓰는 판단력으로 미래도 만날 수 있다는 격려. 불안을 금지하거나 결과를 보장하지 않는다. |
| 18 | [명상록 8.36](https://classics.mit.edu/Antoninus/meditations.8.eight.html) | 삶 | 생애 전체의 걱정을 한꺼번에 떠올리지 않고 현재로 범위를 좁히는 첫 논지. 후반부의 질책은 제외. |
| 19 | [세네카 서간 2.4](https://www.thelatinlibrary.com/sen/seneca.ep1.shtml) | 작은실천 | 여러 독서 중 한 가지 생각을 골라 그날 소화하는 제안. 이어지는 에피쿠로스 인용은 사용하지 않았다. |
| 20 | [세네카 서간 3.2](https://www.thelatinlibrary.com/sen/seneca.ep1.shtml) | 관계 | 신중히 맺은 친구에게 자신에게 말하듯 말하는 태도. 무조건적인 신뢰 요구는 제외. |
| 21 | [세네카 서간 3.6](https://www.thelatinlibrary.com/sen/seneca.ep1.shtml) | 휴식 | 활동과 휴식을 함께 두자는 세네카의 결론과 낮·밤 비유. 앞의 폼포니우스 인용과 구별한다. |
| 22 | [세네카 서간 6.4](https://www.thelatinlibrary.com/sen/seneca.ep1.shtml) | 관계 | 배운 좋은 것을 벗과 나누는 기쁨. 뒤의 헤카톤 인용은 사용하지 않았다. |
| 23 | [세네카 서간 9.3](https://www.thelatinlibrary.com/sen/seneca.ep1.shtml) | 자기수용 | 자족하는 사람도 친구·이웃·동료를 원한다는 논지. 고립을 이상화하지 않는다. |
| 24 | [세네카 서간 11.5](https://www.thelatinlibrary.com/sen/seneca.ep1.shtml) | 자기수용 | 낯선 상황의 얼굴 붉어짐을 마음의 약함으로 재단하지 않는 부분. 의학적 진단문으로 확장하지 않는다. |

장절 번호가 없는 MIT 본문은 번호가 있는 [명상록 4권 대조본](https://en.wikisource.org/wiki/The_Meditations_of_the_Emperor_Marcus_Antoninus/Book_4), [5권 대조본](https://en.wikisource.org/wiki/The_Meditations_of_the_Emperor_Marcus_Antoninus/Book_5), [6권 대조본](https://en.wikisource.org/wiki/The_Meditations_of_the_Emperor_Marcus_Antoninus/Book_6), [7권 대조본](https://en.wikisource.org/wiki/The_Meditations_of_the_Emperor_Marcus_Antoninus/Book_7), [8권 대조본](https://en.wikisource.org/wiki/The_Meditations_of_the_Emperor_Marcus_Antoninus/Book_8)과 함께 확인했다. 의역의 근거 URL은 시드에 명시한 Long 본문으로 유지한다.

## 운영 동작

관리자 화면의 **명언**에서 **검수 대기 / 사용 중 / 미사용** 상태를 관리한다. 신규 문장과 내용이 수정된 문장은 검수 대기가 되고 사용이 꺼진다. 원문과 의역을 확인한 뒤 사용을 켜면 승인 기록이 남는다. 검수한 뒤에도 사용하지 않을 문장은 미사용으로 관리할 수 있다.

승인되어 사용 중인 항목에서 무작위로 1개를 골라 **새로 생성하는 사랑받기·칭찬받기**의 참고 문장으로 전달한다. 기존 저장 응답은 바뀌지 않는다. 화면의 **다시 받기**로 새 응답을 생성하면 다시 선택하며, 무작위이므로 같은 문장이 재선택될 수 있다. 사용된 문장의 저자·장절·링크와 의역/번역 구분은 **함께 읽은 문장**을 펼쳐 확인할 수 있다.

사용 가능한 승인 항목이 0개이거나 DB 조회가 실패해도 기존 AI 응답 흐름은 정상 동작한다. 미검수 문장을 대신 사용하지 않는다. 명언 컨텍스트는 사용자의 행동·기록·감정에 대한 증거가 아니며, 오늘 자료 우선·과거 날짜 구분 규칙을 그대로 지킨다.

## 사용 전 관리자 검수

초기 24개 모두 `enabled=false`, `reviewed_at=null`, `reviewed_by=null`로 시작한다. `created_at`과 `updated_at`은 V26의 epoch 밀리초 기본값을 사용하며, 콘텐츠 승인 시점이 아니다. 마이그레이션 실행·출처 조사 완료·테스트 통과만으로 승인 상태를 만들지 않는다.

관리자는 다음 내용을 문장별로 확인한 뒤 승인한다.

1. 링크의 해당 장절을 실제로 읽고 저자·저서·화자·재인용 여부를 대조한다. 본문을 확인할 수 없거나 이견이 풀리지 않으면 비활성 상태를 유지한다.
2. 시드의 한국어 문장이 선택한 사상을 벗어나지 않는지 확인한다. 직인용·정확한 번역을 표방하지 않고 의역 고지를 유지한다.
3. 휴식을 게으름으로 몰거나, 아픔을 의지 부족으로 돌리거나, 운명에 순응하라고 압박하는 문장으로 읽히지 않는지 확인한다. 자기수용과 작은 실천을 성취 강요로 바꾸지 않는다.
4. 승인한 관리자와 승인 시점을 운영 기능으로 기록하고 사용 가능 상태로 바꾼다. 일괄 자동 승인이나 시드의 승인 값 변경으로 검수를 대신하지 않는다.
5. 본문·저자·출처·링크·종류 등 편집 내용이 바뀌면 다시 검수한다. 오류나 오인용 신고가 있으면 우선 사용을 중지하고 출처를 재확인한다.

선정과 실제 응답 생성은 분리한다. 승인된 문장도 사용자의 오늘 기록을 대신하는 근거로 쓰거나, 과거 행동을 오늘 한 일로 단정하는 근거로 쓰지 않는다. 인용문에 맞추어 사용자의 상태·감정·행동을 만들어내지 않는다. 승인된 문장이 없으면 미검수 시드로 대신하지 않는다.
