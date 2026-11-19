-- Fifty new cards for the existing public comfort feed.
-- Korean quotation translations and reflections are by Sorow. Each card keeps
-- the textual source and the museum's work-level rights and collection record.
INSERT INTO users (id, nick, role, is_anonymous, created_at)
VALUES ('sorow-curator', '소로우', 'user', FALSE, CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
ON CONFLICT (id) DO NOTHING;
INSERT INTO creators (user_id, bio) VALUES ('sorow-curator', '그림 한 점과 마음을 돌보는 문장')
ON CONFLICT (user_id) DO NOTHING;

WITH entries (n, title, reflection, quotation, author, quote_credit, quote_source,
              art_credit, art_source, image, ink) AS (
  VALUES
    (21, '다시 눈에 들어온 것', '수련을 한참 바라보다 잎 사이로 물빛이 비치는 걸 보았다. 지친 날에도 내가 예쁘다고 느끼는 색 하나는 남아 있었다.', '작은 것들에 맺힌 이슬 속에서
마음은 아침을 만나 다시
싱그러워진다.', '칼릴 지브란', '칼릴 지브란 · 『예언자』 「우정에 대하여」 · 소로우 옮김', 'https://en.wikisource.org/wiki/Page:Kahlil_Gibran_-_The_Prophet_(1926_edition,_Knopf).pdf/83', '클로드 모네 · 〈수련(아가판투스)〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1960.81', 'https://openaccess-cdn.clevelandart.org/1960.81/1960.81_web.jpg', 'ink'),
    (22, '창밖의 빨간 목도리', '창밖을 스치는 빨간 목도리에 보고 싶던 사람이 떠올랐다. 잘 지내느냐는 쉬운 말을 나는 왜 자꾸 특별한 날까지 아껴 두었을까.', '우리가 미루는 사이에도 삶은
달려간다.', '세네카', '세네카 · 『루킬리우스에게 보낸 편지』 1편 3절 · 소로우 옮김', 'https://www.yorku.ca/pswarney/Texts/seneca/epistula/epistula-1.htm', '클로드 모네 · 〈붉은 스카프〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1958.39', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3DFFFCD6DDAD8D7EC152F4C775455B0C5C1E8D6380C6B8090415E121F58678CB0A%26s%3D24247294%26se%3D116628280%26v%3D0%26f%3D1958.39_o5.jpg&w=640', 'ink'),
    (23, '여기에 있는 사람', '오늘 이룬 일을 적으려다 펜을 놓았다. 이 의자에 지친 몸을 기대 앉는 데에도 자격이 필요할까.', '있는 그대로 내가 여기에 있다.
그것으로 충분하다.', '월트 휘트먼', '월트 휘트먼 · 『풀잎』 「나 자신의 노래」 20절 · 소로우 옮김', 'https://poets.org/poem/song-myself-20', '앙리 팡탱라투르 · 〈르롤 부인〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1969.54', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3D0060CB56E8116AA3640760894A0FE9F092063B4935C03004606C8F401B667AA5%26s%3D24247294%26se%3D116628280%26v%3D3%26f%3D1969.54_o5.jpg&w=640', 'cream'),
    (24, '다시 맞는 아침', '컵을 헹구고 창을 연다. 내 삶에 새로 손대는 일이 이만큼 작아도 좋은 아침이다.', '아침은 날마다 나를 반갑게
불렀다. 자연만큼이나 소박하게
살아 보라고.', '헨리 데이비드 소로', '헨리 데이비드 소로 · 『월든』 「내가 살았던 곳과 살아간 까닭」 · 소로우 옮김', 'https://en.wikisource.org/wiki/Walden_(1854)_Thoreau/Where_I_Lived,_and_What_I_Lived_for', '클로드 모네 · 〈앙티브의 정원사 집〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1916.1044', 'https://openaccess-cdn.clevelandart.org/1916.1044/1916.1044_web.jpg', 'ink'),
    (25, '풀밭을 가로지르는 마음', '흰 말 앞에 펼쳐진 풀밭을 본다. 누군가 내게 붙인 이름보다 내가 한 발 내디딜 수 있는 쪽이 조금 더 넓다.', '나는 새가 아니다. 어떤 그물도
나를 붙잡을 수 없다.', '샬럿 브론테', '샬럿 브론테 · 『제인 에어』 23장 · 소로우 옮김', 'https://en.wikisource.org/wiki/Jane_Eyre_(c._1900_W._Nicholson_%26_Sons_edition)/Chapter_XXIII', '윈슬로 호머 · 〈흰 암말〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1958.33', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3DAED6CFA92FA4C970DAED719BD93268364A69C7295F9B9D3FD087BA16E1BD1D36%26s%3D24247294%26se%3D116628280%26v%3D4%26f%3D1958.33_o5.jpg&w=640', 'ink'),
    (26, '빛이 닿는 순서', '길모퉁이의 이끼는 해 질 무렵에야 볕을 받는다. 하루 중 가장 늦은 빛이 그 자리를 가장 환하게 만든다.', '저녁 햇살이 깊은 숲으로 들어와
푸른 이끼 위를 다시 비춘다.', '왕유', '왕유 · 『망천집』 「녹채」 · 소로우 옮김', 'https://zh.wikisource.org/wiki/輞川集_(王維)#鹿柴', '카미유 피사로 · 〈퐁투아즈 레르미타주의 숲 가장자리〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1951.356', 'https://openaccess-cdn.clevelandart.org/1951.356/1951.356_web.jpg', 'ink'),
    (27, '해진 곳을 꿰매는 손', '떨어진 단추가 어느새 다시 달려 있던 어린 날의 외투. 누가 저녁을 조금 떼어 내 내일의 나를 입혀 주었는지 이제야 생각한다.', '세상의 선이 자라나는 데에는
역사에 기록되지 않는 행동들도
한몫한다.', '조지 엘리엇', '조지 엘리엇 · 『미들마치』 맺음말 · 소로우 옮김', 'https://en.wikisource.org/wiki/Middlemarch_(1874)/Finale', '카미유 피사로 · 〈옷을 깁는 여인〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1927.298', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3D21E84467ADB317C9278E36ADCFB6A5EE327E0E086FDBE38A1B049314C1F564CA%26s%3D24247294%26se%3D116628280%26v%3D3%26f%3D1927.298_o5.jpg&w=640', 'ink'),
    (28, '빗속의 걸음걸이', '비를 피할 처마가 멀다. 우산을 두드리는 소리를 들으며 걷다 보니 이 날씨에만 들리는 박자가 있다.', '숲을 헤치고 잎을 두드리는
빗소리는 그냥 두자. 흥얼거리며
천천히 걸으면 어떠랴.', '소식', '소식 · 「정풍파」 · 소로우 옮김', 'https://zh.wikisource.org/zh/定風波_(莫聽穿林打葉聲)', '카미유 피사로 · 〈퐁투아즈 레르미타주의 숲 풍경〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/2004.105', 'https://openaccess-cdn.clevelandart.org/2004.105/2004.105_web.jpg', 'cream'),
    (29, '비워 둔 그릇', '일정을 하나 지우고 나니 기다리던 전화를 오래 받을 수 있었다. 비워 둔 칸에 어떤 얼굴이 들어올지는 미리 알 수 없다.', '흙을 빚어 그릇을 만들면, 속을
비운 자리 덕분에 그릇을 쓸 수
있다.', '노자', '노자 · 『도덕경』 11장 · 소로우 옮김', 'https://zh.wikisource.org/wiki/道德真經', '카미유 피사로 · 〈연못가에 앉은 여인〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/2024.58', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3DBFDDB3D7CF82894E784A32690C51B81E6B492B35F6759008FD849CC0633BFB45%26s%3D24247294%26se%3D399313166%26v%3D3%26f%3D%5Cd0923%5Cu354709234%5C2024.58_o5.jpg&w=640', 'ink'),
    (30, '아직 모르는 수위', '가장 힘들었던 날의 나로 내 평생을 짐작했던 적이 있다. 강가에 다시 서 보니 지난번에 앉았던 돌이 물에 잠겨 있다.', '우리 안의 생명은 강물과 같다.
올해는 누구도 본 적 없는
높이까지 차오를지 모른다.', '헨리 데이비드 소로', '헨리 데이비드 소로 · 『월든』 맺음말 · 소로우 옮김', 'https://en.wikisource.org/wiki/Walden_(1854)_Thoreau/Conclusion', '카미유 피사로 · 〈퐁투아즈의 수문〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1990.7', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3DFFFCD6DDAD8D7EC1CCC3BBC3AF9930F3F25F3D521794ECD4A1C1B30202DAC2D9%26s%3D24247294%26se%3D116628280%26v%3D0%26f%3D1990.7_o5.jpg&w=640', 'ink'),
    (31, '꽃이 다녀간 자리', '오래전에 누가 장미를 한 송이 사 왔다. 그 꽃이 얼마나 갔는지는 잊었는데, 문이 열리던 순간은 아직도 선명하다.', '그러면 내 마음은 기쁨으로 가득
차, 수선화들과 함께 춤을 춘다.', '윌리엄 워즈워스', '윌리엄 워즈워스 · 「구름처럼 홀로 거닐다가」 4연 · 소로우 옮김', 'https://poets.org/poem/i-wandered-lonely-cloud', '앙리 팡탱라투르 · 〈꽃병의 장미〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1979.137', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3D5DE14B1214CDFA7EDC16D966B312B40D56AF297FC79B47EFCE706266F0032097%26s%3D24247294%26se%3D116628280%26v%3D3%26f%3D1979.137_o5.jpg&w=640', 'cream'),
    (32, '따뜻한 한 끼', '찬밥에 물을 말아 먹으면서도 마주 앉은 사람과 한참 웃은 저녁. 오래 기억하는 식탁에는 꼭 좋은 그릇이 놓여 있지는 않다.', '거친 밥을 먹고 물을 마시며,
팔을 베고 누워도 그 안에
즐거움이 있다.', '공자', '공자 · 『논어』 「술이」 · 소로우 옮김', 'https://zh.wikisource.org/wiki/論語/述而第七', '장시메옹 샤르댕 · 〈청어가 있는 정물〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1974.1', 'https://openaccess-cdn.clevelandart.org/1974.1/1974.1_web.jpg', 'cream'),
    (33, '올해의 꽃을 보러', '다음 봄에도 꽃은 피겠지만 올해의 나는 지금만 이 길을 걷는다. 돌아가는 길에 잠깐 멀리 있는 나무까지 다녀왔다.', '꽃 핀 모습을 바라보기에는 쉰
번의 봄도 짧으니, 나는 숲길을
걸으리.', '앨프리드 에드워드 하우스먼', '앨프리드 에드워드 하우스먼 · 「나무 중에 가장 어여쁜」 3연 · 소로우 옮김', 'https://poets.org/poem/loveliest-trees', '클로드 모네 · 〈봄꽃〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1953.155', 'https://openaccess-cdn.clevelandart.org/1953.155/1953.155_web.jpg', 'cream'),
    (34, '창밖에도 길이 있다', '막막한 날엔 내가 서 있는 데서 보이는 길이 세상의 전부 같다. 고개를 조금 돌리면 어제는 가려졌던 모퉁이가 보인다.', '우주는 우리가 생각하는 것보다
더 넓다.', '헨리 데이비드 소로', '헨리 데이비드 소로 · 『월든』 맺음말 · 소로우 옮김', 'https://en.wikisource.org/wiki/Walden_(1854)_Thoreau/Conclusion', '조지 이니스 · 〈겨울 하늘〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1927.388', 'https://openaccess-cdn.clevelandart.org/1927.388/1927.388_web.jpg', 'ink'),
    (35, '그냥 바라볼 자유', '이 장면이 내게 무슨 도움이 될지 묻지 않고 바라본다. 빛이 옮겨 가는 것만으로도 눈앞에서는 충분한 일이 벌어지고 있다.', '마침내 가장 큰 해방이
찾아왔다. 사물을 그 자체로
생각할 자유였다.', '버지니아 울프', '버지니아 울프 · 『자기만의 방』 2장 · 소로우 옮김', 'https://en.wikisource.org/wiki/Page:A_Room_of_One%27s_Own_(Hogarth_1929).djvu/63', '조지 이니스 · 〈맑은 가을날〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1956.578', 'https://openaccess-cdn.clevelandart.org/1956.578/1956.578_web.jpg', 'ink'),
    (36, '그림을 보는 사람', '그림 앞에 선 사람까지 또 한 장의 그림이 되었다. 아름다운 것을 만나 잠깐 멈춰 선 내 얼굴도 누군가에게는 그런 풍경이었을까.', '아름다운 것은 두고두고 기쁨이
된다.', '존 키츠', '존 키츠 · 『엔디미온』 1권 · 소로우 옮김', 'https://poets.org/poem/endymion-book-i-thing-beauty-joy-ever', '에드가 드가 · 〈루브르 회화관의 메리 커샛〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1929.876', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3D45F9AE505BB16ED40E1939764D2AEDFC39F86B8E096271D07AB5549CEB6458AC%26s%3D24247294%26se%3D116628280%26v%3D3%26f%3D1929.876_o5.jpg&w=640', 'ink'),
    (37, '옆자리 하나', '그날 버틸 수 있었던 까닭을 묻자 그는 누군가 저녁 내내 곁에 앉아 있었다고 했다. 둘이 무슨 말을 했는지는 기억나지 않는다고.', '마음 하나라도 부서지지 않게
붙들 수 있다면, 내 삶은 헛되지
않으리.', '에밀리 디킨슨', '에밀리 디킨슨 · 『시집』 제1집 「삶」 6번 · 소로우 옮김', 'https://en.wikisource.org/wiki/Poems_(Dickinson)/If_I_can_stop_one_heart_from_breaking', '피에르오귀스트 르누아르 · 〈빨래하는 여인과 아이〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1977.167', 'https://openaccess-cdn.clevelandart.org/1977.167/1977.167_web.jpg', 'ink'),
    (38, '누구의 것도 아닌 저녁', '해 질 무렵의 색을 가져갈 수는 없어도 잠깐 같이 바라볼 수는 있다. 옆사람이 볼 수 있게 창가 자리를 조금 비켜 주었다.', '누구도 그 풍경을 소유하지는
않는다.', '랠프 월도 에머슨', '랠프 월도 에머슨 · 『자연』 1장 · 소로우 옮김', 'https://en.wikisource.org/wiki/Nature_(1836)/Chapter_1', '샤를 프랑수아 도비니 · 〈르 라티에에서 본 빌레르빌〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1951.323', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3D6520C9E92F3292C4E00273377D69D1B6883F32CA5C39D7FECF1A932D9A7600EF%26s%3D24247294%26se%3D116628280%26v%3D4%26f%3D1951.323_o5.jpg&w=640', 'ink'),
    (39, '손안의 시간', '작은 돌 하나를 쥐고 천천히 만져 보았다. 손바닥보다 작은 면에도 눈으로만 보아서는 몰랐을 골이 있었다.', '손바닥 안에 무한을, 한 시간
안에 영원을 담아라.', '윌리엄 블레이크', '윌리엄 블레이크 · 「순수의 전조」 3~4행 · 소로우 옮김', 'https://en.wikisource.org/wiki/The_Pickering_Manuscript/Auguries_of_Innocence', '모리스 프렌더개스트 · 〈바위 해안〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1953.655', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3D85F8F6085DED0661D7BC6ECE66208F27D12591CE8480D6722DC6809FEFEB3D72%26s%3D24247294%26se%3D399313166%26v%3D4%26f%3D1953.655_o5.jpg&w=640', 'ink'),
    (40, '내가 쓰는 한 시간', '모두에게 나눠 주고 남은 시간에만 나를 만나려 했다. 오늘은 해가 지기 전에 내 몫의 의자를 창가로 끌어왔다.', '우리 것이 있다면, 그것은 오직
시간뿐이다.', '세네카', '세네카 · 『루킬리우스에게 보낸 편지』 1편 3절 · 소로우 옮김', 'https://www.yorku.ca/pswarney/Texts/seneca/epistula/epistula-1.htm', '샤를 프랑수아 도비니 · 〈우아즈강의 석양〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1964.289', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3D6520C9E92F3292C4B6EA65A6E636F1154255E01D1BBD89BB4F0A958BA0EAF20B%26s%3D24247294%26se%3D116628280%26v%3D4%26f%3D1964.289_o5.jpg&w=640', 'ink'),
    (41, '한 배를 타고', '같은 배에 올라서도 저마다 돌아갈 집은 다르다. 배가 기우뚱했을 때 내 팔꿈치를 먼저 잡아 준 손은 오래 기억난다.', '이번 생은 바다를 건너는 일.
우리는 비좁은 한 배에서 서로
만난다.', '라빈드라나트 타고르', '라빈드라나트 타고르 · 『길 잃은 새』 242편 · 소로우 옮김', 'https://en.wikisource.org/wiki/Page:Stray_Birds.djvu/76', '조지프 말러드 윌리엄 터너 · 〈산들바람 속의 배들〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1919.131', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3DDF82ED49D4D801E40B2E050BBEBDF06AB9E510DFB2433CC8B28A33DE21DAF802%26s%3D24247294%26se%3D116628280%26v%3D4%26f%3D1919.131_o5.jpg&w=640', 'ink'),
    (42, '굽어 흐른 자리', '잘못 접어들었던 골목 덕분에 다음번엔 길 잃은 사람에게 방향을 일러 줄 수 있었다. 헤맨 길도 내 안에 남아 있었다.', '진리의 물줄기는 숱한 실수가 파
놓은 물길을 따라 흐른다.', '라빈드라나트 타고르', '라빈드라나트 타고르 · 『길 잃은 새』 243편 · 소로우 옮김', 'https://en.wikisource.org/wiki/Page:Stray_Birds.djvu/76', '헨리 워드 레인저 · 〈바다 풍경〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1967.21', 'https://openaccess-cdn.clevelandart.org/1967.21/1967.21_web.jpg', 'ink'),
    (43, '아직 오지 않은 일', '걱정은 먼 훗날의 대답까지 오늘 다 준비해 둔다. 저녁밥이 식기 전에 우선 오늘 내 앞에 앉아 있는 사람을 본다.', '우리는 현실에서보다 상상
속에서 더 자주 고통받는다.', '세네카', '세네카 · 『루킬리우스에게 보낸 편지』 13편 4절 · 소로우 옮김', 'https://latin.packhum.org/loc/1017/15/12', '앨버트 비어슈타트 · 〈전나무와 폭풍 구름〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1982.37', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3D8FB760F48169EFA27CD0FF6E51AE96EB740C972BFCC2C457C4457E861555FA9F%26s%3D24247294%26se%3D116628280%26v%3D4%26f%3D1982.37_o5.jpg&w=640', 'cream'),
    (44, '숲에 드는 마지막 빛', '해가 져도 숲의 색은 한꺼번에 사라지지 않는다. 혼자 맞는 저녁에 창을 조금 열고 내 방까지 들어오는 빛을 기다렸다.', '깊은 숲속, 아무도 내가 있는 줄
모르는데 밝은 달이 찾아와 나를
비춘다.', '왕유', '왕유 · 『망천집』 「죽리관」 · 소로우 옮김', 'https://zh.wikisource.org/wiki/輞川集_(王維)#竹里館', '프레더릭 에드윈 처치 · 〈황야의 황혼〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1965.233', 'https://openaccess-cdn.clevelandart.org/1965.233/1965.233_web.jpg', 'cream'),
    (45, '늦게 온 사람의 방', '길을 잘못 들어 마지막에 도착한 사람에게도 마른 수건 한 장, 다리를 펼 만큼의 자리가 있으면 좋겠다.', '저와 다른 나그네들이 누울
자리도 있을까요? 그럼요, 오는
이 모두에게 잠자리가 있지요.', '크리스티나 로세티', '크리스티나 로세티 · 「오르막길」 4연 · 소로우 옮김', 'https://poets.org/poem/hill/print', '프레더릭 에드윈 처치 · 〈산페드로 수도원〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1915.684', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3D5F8D3BDD65810BF6A455295EFE564D00CD6A309125FD6BD178A6A441E2168674%26s%3D24247294%26se%3D116628280%26v%3D1%26f%3D%5C363.1915_o5.jpg&w=640', 'ink'),
    (46, '낮은 곳의 물', '흐르는 물은 낮은 곳의 흙까지 고루 적신다. 남들의 눈이 덜 가는 자리에 조용히 가 닿는 다정함을 생각한다.', '물은 온갖 것을 이롭게 하면서도
다투지 않는다.', '노자', '노자 · 『도덕경』 8장 · 소로우 옮김', 'https://zh.wikisource.org/wiki/道德真經', '야코프 판 라위스달 · 〈급류 옆 교회가 있는 풍경〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1962.256', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3D63845A470EF8469558F943A5B647AB05191F99631B154F2ECCF364239CDE6EC2%26s%3D24247294%26se%3D399313166%26v%3D3%26f%3D1962.256_o5.jpg&w=640', 'ink'),
    (47, '밤새 내린 것', '아침에 나가 보니 먼지가 가라앉고 흙냄새가 짙어져 있다. 아무도 깨어 보지 않았던 사이에도 일어난 일들이 있다.', '바람 따라 밤에 가만히
스며들어, 소리 없이 온갖 것을
적신다.', '두보', '두보 · 「봄밤에 내리는 반가운 비」 · 소로우 옮김', 'https://zh.wikisource.org/wiki/春夜喜雨', '애셔 B. 듀랜드 · 〈숲 사이로 보이는 시냇물〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1960.162', 'https://openaccess-cdn.clevelandart.org/1960.162/1960.162_web.jpg', 'cream'),
    (48, '검은 흙의 봄', '아무것도 남지 않은 줄 알았던 땅에서 작은 풀이 고개를 든다. 땅속에서 보낸 시간은 겉을 보는 눈으로 셀 수 없다.', '들불도 풀을 남김없이 태우지는
못한다. 봄바람이 불면 다시
돋는다.', '백거이', '백거이 · 「오래된 들판의 풀을 두고 벗을 보내며」 · 소로우 옮김', 'https://zh.wikisource.org/wiki/賦得古原草送別', '에두아르 뷔야르 · 〈들판 너머〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1951.65.4', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3DAC6B0398C73213E4E6C6E8B88E3403D3049ED64F220A01F183C8DA4D13B3859C%26s%3D24247294%26se%3D116628280%26v%3D2%26f%3D1951.65.4_o5.jpg&w=640', 'ink'),
    (49, '한 장 너머의 길', '침대에서 일어나기 힘들었던 날, 책 한 권을 펼쳐 낯선 사람의 방에 잠시 다녀왔다. 접어 둔 책장에 내일 다시 찾아갈 곳이 생겼다.', '우리를 먼 나라로 데려가는 데
책만 한 배가 있을까.', '에밀리 디킨슨', '에밀리 디킨슨 · 「책만 한 배는 없다」 첫 두 행 · 소로우 옮김', 'https://poets.org/poem/there-no-frigate-book-1263/print', '베르트 모리조 · 〈독서〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1950.89', 'https://openaccess-cdn.clevelandart.org/1950.89/1950.89_web.jpg', 'ink'),
    (50, '마주 앉아 먹는 사이', '할머니는 내 대답이 늦어도 그릇을 거두지 않으셨다. 지금 생각하면 그 식탁에서 제일 따뜻했던 건 밥보다 오래 기다려 주던 시간이다.', '친구가 말이 없을 때에도 네
마음은 그 마음에 귀 기울이기를
멈추지 않는다.', '칼릴 지브란', '칼릴 지브란 · 『예언자』 「우정에 대하여」 · 소로우 옮김', 'https://en.wikisource.org/wiki/Page:Kahlil_Gibran_-_The_Prophet_(1926_edition,_Knopf).pdf/82', '에두아르 뷔야르 · 〈점심 식사(아네트와 할머니)〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/2020.118', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3DD0348ADB1CE7831173A9E6B65D6B919B3483329EA6A3135575A2A514E7BDE86C%26s%3D24247294%26se%3D116628280%26v%3D1%26f%3D%5Cd5137%5Cu220451374%5C2020.118_o5.jpg&w=640', 'cream'),
    (51, '밑줄 친 곳에서', '친구가 빌려준 책에서 연필 자국을 발견했다. 얼굴을 보고 말하기 어려웠던 이야기가 다음에 만나 물어볼 한 문장이 되었다.', '친구란 내 진심을 꺼내도 좋은
사람이다. 그 앞에서는 생각을
소리 내어 말할 수 있다.', '랠프 월도 에머슨', '랠프 월도 에머슨 · 『에세이』 제1집 「우정」 · 소로우 옮김', 'https://en.wikisource.org/wiki/Essays:_First_Series/Friendship', '니콜라베르나르 레피시에 · 〈책을 읽는 여인〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1964.288', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3DF45C37795F99663E74A6FE0C66874DDDEA94989C2F687E811EF3C613C344FE50%26s%3D24247294%26se%3D116628280%26v%3D3%26f%3D1964.288_o5.jpg&w=640', 'ink'),
    (52, '같은 자리에서', '한참 울었던 부엌에서 어느 날은 국을 간보다가 웃음이 났다. 두 장면 모두 내가 살아낸 집의 기억이다.', '네 웃음이 솟아나는 바로 그
우물이 예전에는 네 눈물로
차오르곤 했다.', '칼릴 지브란', '칼릴 지브란 · 『예언자』 「기쁨과 슬픔에 대하여」 · 소로우 옮김', 'https://en.wikisource.org/wiki/Page:Kahlil_Gibran_-_The_Prophet_(1926_edition,_Knopf).pdf/47', '에두아르 뷔야르 · 〈난롯가〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1951.65.9', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3DA76AC1D8C6D44155E076FD912C5C077717C2BA06DF69D90993DBD66F2E8AEB1A%26s%3D24247294%26se%3D116628280%26v%3D3%26f%3D1951.65.9_o5.jpg&w=640', 'ink'),
    (53, '각자 좋아하는 풍경', '함께 길을 걷다 한 사람은 물가에, 다른 사람은 언덕에 멈췄다. 무엇을 좋아해 오래 서 있었는지 서로에게 들려줄 수 있다.', '지혜로운 이는 물을 좋아하고,
어진 이는 산을 좋아한다.', '공자', '공자 · 『논어』 「옹야」 · 소로우 옮김', 'https://zh.wikisource.org/wiki/論語/雍也第六', '야코프 판 라위스달 · 〈숲이 우거진 언덕 풍경〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1963.575', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3DD63E14581360978B77DE7C85A4E780AE033F9AAF4489A8CD68EF341E3838C82F%26s%3D24247294%26se%3D116628280%26v%3D8%26f%3D1963.575_o5.jpg&w=640', 'ink'),
    (54, '강 건너에서 본 우리 동네', '매일 다니는 동네도 강 건너에서 보면 지붕 선부터 새롭다. 그날 왜 그랬는지, 내 기억을 잠시 접고 네 자리에서 들어 보고 싶다.', '자기 주장만 아는 사람은 그
주장조차 제대로 알지 못한다.', '존 스튜어트 밀', '존 스튜어트 밀 · 『자유론』 2장 · 소로우 옮김', 'https://en.wikisource.org/wiki/Page:On_Liberty_(4th_Edition).djvu/67', '얀 판 호이언 · 〈에머리히의 전경〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1959.351', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3D8FB760F48169EFA2F29BE7B2727766C5405567F20450D6ABBA05098AEEECCA11%26s%3D24247294%26se%3D399313166%26v%3D4%26f%3D1959.351_o5.jpg&w=640', 'ink'),
    (55, '고개를 들었더니', '손끝의 일에만 빠져 있다 문득 먼 산을 본다. 내가 종일 바라보지 않은 곳에도 저렇게 큰 풍경이 있었다.', '동쪽 울타리 아래서 국화를 따다
문득 느긋이 남산을 바라본다.', '도연명', '도연명 · 「음주」 제5수 · 소로우 옮김', 'https://zh.wikisource.org/wiki/飲酒二十首', '야코프 판 라위스달 · 〈풍차가 있는 풍경〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1967.19', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3D8FB760F48169EFA28EDBC95529D9928E4C142D98157E3C9B3635E4ABC370E5F8%26s%3D24247294%26se%3D399313166%26v%3D7%26f%3D1967.19_o5.jpg&w=640', 'ink'),
    (56, '수레를 밀어 준 사람', '턱에 걸린 손수레를 낯선 이가 뒤에서 잠깐 밀어 주었다. 얼마나 힘들었는지 설명할 새도 없이, 수레가 다시 앞으로 갔다.', '살아 있는 동안, 아직 네 힘이
닿는 동안, 좋은 사람이 되어라.', '마르쿠스 아우렐리우스', '마르쿠스 아우렐리우스 · 『명상록』 4권 17절 · 소로우 옮김', 'https://classics.mit.edu/Antoninus/meditations.4.four.html', '빈센트 반 고흐 · 〈손수레가 있는 풍경〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1958.30', 'https://openaccess-cdn.clevelandart.org/1958.30/1958.30_web.jpg', 'ink'),
    (57, '빈 병에 비친 얼굴', '빈 병에 장미를 나눠 꽂아 옆집 문 앞에 두었다. 며칠 뒤 빈 병이 돌아왔을 때, 그 안에는 잘 익은 자두 두 알이 들어 있었다.', '덕을 지닌 이는 외롭지 않다.
반드시 이웃이 있다.', '공자', '공자 · 『논어』 「이인」 · 소로우 옮김', 'https://zh.wikisource.org/wiki/論語/里仁第四', '피에르오귀스트 르누아르 · 〈꽃병에 꽂힌 장미〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1941.14', 'https://openaccess-cdn.clevelandart.org/1941.14/1941.14_web.jpg', 'cream'),
    (58, '귀로 만나는 숲', '물살이 바위를 넘는 모습을 보고 있자니 그림에서도 소리가 나는 듯하다. 바쁜 날에 눈으로 흘려보낸 풍경을 오늘은 귀로도 만나고 싶다.', '물은 이끼가 번진 층계를
철썩이며 흘러내리고, 공기마저
그 물과 함께 고동친다.', '에이미 로웰', '에이미 로웰 · 「정원에서」 11~13행 · 소로우 옮김', 'https://en.wikisource.org/wiki/In_a_Garden_(Lowell)', '야코프 판 라위스달 · 〈고사한 너도밤나무가 있는 숲속의 낮은 폭포〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1967.63', 'https://openaccess-cdn.clevelandart.org/1967.63/1967.63_web.jpg', 'cream'),
    (59, '기억이 나는 온도', '오래된 하루를 떠올릴 때 먼저 돌아오는 것은 말보다 냄새와 온기다. 비 오는 날 빌려 입은 웃옷이 아직도 생각난다.', '빗속의 솔향기, 너를 사랑하는
눈, 너를 안아 주는 팔.', '세라 티즈데일', '세라 티즈데일 · 「물물교환」 2연 · 소로우 옮김', 'https://poets.org/poem/barter/print', '우타가와 히로시게 · 〈신오하시 다리와 아타케의 소나기〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1985.318', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3D93CA68A76312B29794314F58EA3EB4F6CCD3E87A68AE701C57A6CF3345DCE5E8%26s%3D24247294%26se%3D399313166%26v%3D0%26f%3D1985.318_o5.jpg&w=640', 'ink'),
    (60, '밤을 올려다보는 동안', '밤하늘을 잠깐 바라보았다. 아무 대답도 하지 않아도 되는 시간이 얼마 만인지 그제야 알았다.', '홀로 있고 싶다면 별을 보라.', '랠프 월도 에머슨', '랠프 월도 에머슨 · 『자연』 1장 · 소로우 옮김', 'https://en.wikisource.org/wiki/Nature_(1836)/Chapter_1', '우타가와 히로시게 · 〈기소 가도의 산과 강〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1930.180.c', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3D35A5F91EF3D3ED1A55CBE28BD656F2B29DD2515A9AC9BA10B2BE126915DB98E4%26s%3D24247294%26se%3D399313166%26v%3D1%26f%3D%5Cd1954%5Cu3019547%5C1930.180.c_o5.jpg&w=640', 'ink'),
    (61, '늘 그 자리에 있는 산', '다시 찾아간 산은 기다렸다는 말도, 왜 늦었냐는 말도 없다. 아무것도 설명하지 않고 오래 마주 볼 수 있는 얼굴이 내게도 있다.', '마주 보아도 서로 싫증 나지
않는 건, 오직 경정산과
나뿐이다.', '이백', '이백 · 「경정산에 홀로 앉아」 · 소로우 옮김', 'https://zh.wikisource.org/wiki/獨坐敬亭山', '폴 세잔 · 〈생트빅투아르산〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1958.21', 'https://openaccess-cdn.clevelandart.org/1958.21/1958.21_web.jpg', 'ink'),
    (62, '창을 여는 소리', '이른 아침 새소리가 들리는 동안은 휴대폰을 켜지 않았다. 오늘 세상이 내게 건넨 첫 소리를 조금 더 듣고 싶었다.', '새의 노래는 땅이 아침 햇살에
돌려주는 메아리다.', '라빈드라나트 타고르', '라빈드라나트 타고르 · 『길 잃은 새』 245편 · 소로우 옮김', 'https://en.wikisource.org/wiki/Page:Stray_Birds.djvu/76', '폴 세잔 · 〈숲속 오솔길〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/2021.165', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3DAA3EDDF28AA4D17304CCC10E7C7FF1931B79DD3A539BC322C01943C269B01208%26s%3D24247294%26se%3D399313166%26v%3D3%26f%3D%5Cd1109%5Cu374911094%5C2021.165_o5.jpg&w=640', 'ink'),
    (63, '한 모금의 사이', '화가 난 채 보내려던 답장을 내려놓고 물 한 모금을 마셨다. 돌아왔을 때는 첫 문장을 다르게 쓸 수 있었다.', '조금만 시간을 벌어 숨을
돌리면, 자신을 다스리기가 한결
쉬워진다.', '에픽테토스', '에픽테토스 · 『엥케이리디온』 20절 · 소로우 옮김', 'https://classics.mit.edu/Epictetus/epicench.html', '폴 세잔 · 〈시냇물〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1958.20', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3DFFFCD6DDAD8D7EC1B1A443B765FD75856B31DE89BB38F363EF3D8B207D219CAD%26s%3D24247294%26se%3D116628280%26v%3D0%26f%3D1958.20_o5.jpg&w=640', 'cream'),
    (64, '사과 한 알을 건네며', '사과를 고르던 손님이 떠난 뒤에도 그가 건넨 인사 한마디는 남는다. 내가 별 뜻 없이 한 말이 다른 사람의 오후를 바꾸기도 한다.', '이 커다란 연극은 계속되고,
너도 거기에 한 구절을 보탤 수
있다.', '월트 휘트먼', '월트 휘트먼 · 「오, 나여! 오, 삶이여!」 마지막 행 · 소로우 옮김', 'https://poets.org/poem/o-me-o-life', '피에르오귀스트 르누아르 · 〈사과 장수〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1958.47', 'https://openaccess-cdn.clevelandart.org/1958.47/1958.47_web.jpg', 'ink'),
    (65, '내 몫의 장면', '오늘 맡은 역이 낯설어서 대사가 자꾸 꼬인다. 한 장면이 끝나면 숨을 고르고 다시 들어갈 틈이 있다.', '네 몫은 네게 주어진 배역을 잘
연기하는 것이다.', '에픽테토스', '에픽테토스 · 『엥케이리디온』 17절 · 소로우 옮김', 'https://classics.mit.edu/Epictetus/epicench.html', '에두아르 마네 · 〈베르크쉬르메르의 배들〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1940.534', 'https://openaccess-cdn.clevelandart.org/1940.534/1940.534_web.jpg', 'ink'),
    (66, '흙을 만지는 날들', '밭에서는 손을 바삐 쓸 때와 가만히 흙을 두어야 할 때가 돌아온다. 심어 둔 것이 아직 보이지 않는 저녁에도 밭은 거기에 있다.', '애쓰는 법을 배우고, 기다리는
법도 배우자.', '헨리 워즈워스 롱펠로', '헨리 워즈워스 롱펠로 · 「인생 찬가」 마지막 행 · 소로우 옮김', 'https://poets.org/poem/psalm-life', '윈슬로 호머 · 〈들에서 일하는 여인들〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1992.315', 'https://openaccess-cdn.clevelandart.org/1992.315/1992.315_web.jpg', 'ink'),
    (67, '두 손을 쉬게 하는 날', '추운 길을 걷다 외투 깊이 손을 넣는다. 하루 종일 무언가를 붙들고 있던 두 손이, 이제는 그저 따뜻해지기만 해도 좋은 시간이다.', '그런데도 이 모든 떨어짐을 두
손에 한없이 부드럽게 받아 드는
이가 있다.', '라이너 마리아 릴케', '라이너 마리아 릴케 · 『형상시집』 「가을」 · 소로우 옮김', 'https://de.wikisource.org/wiki/Herbst_(Rilke)', '에두아르 마네 · 〈머프를 낀 베르트 모리조〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1958.34', 'https://openaccess-cdn.clevelandart.org/1958.34/1958.34_web.jpg', 'cream'),
    (68, '아직 쓰지 않은 하루', '어젯밤에 지우지 못한 말이 있다. 아침이 오면 그 사람에게 새로 건넬 첫마디도 생긴다.', '머릴라, 내일은 아직 실수 하나
없는 새날이라고 생각하면 기분
좋지 않아요?', '루시 모드 몽고메리', '루시 모드 몽고메리 · 『빨간 머리 앤』 21장 · 소로우 옮김', 'https://en.wikisource.org/wiki/Page:Anneofgreengables-rbsc.djvu/269', '윈슬로 호머 · 〈닻 위에 앉은 소년〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1954.128', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3DBF3FC65E81FD8A74BE33B3E5D287DF011B06CD5F99BF05467F0EB2C8C717ABBA%26s%3D24247294%26se%3D116628280%26v%3D3%26f%3D%5Cd5066%5Cu912150668%5C1954.128_o5.jpg&w=640', 'ink'),
    (69, '들판에 남은 콧노래', '함께 걸었던 사람이 흥얼거리던 노래가 한참 뒤 홀로 걷는 길에서 떠올랐다. 곁에 머문 시간이 짧았어도 이런 식으로 함께 걷는 날이 있다.', '여름의 떠돌이 새들이 내 창으로
와 노래하고 날아간다.', '라빈드라나트 타고르', '라빈드라나트 타고르 · 『길 잃은 새』 1편 · 소로우 옮김', 'https://en.wikisource.org/wiki/Page:Stray_Birds.djvu/13', '윈슬로 호머 · 〈양치기 소녀〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1924.489', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3DEA00CA1581557F416CFC5B716652A08BAA54EA6E968B4E1D37E2184142753667%26s%3D24247294%26se%3D399313166%26v%3D3%26f%3D1924.489_o5.jpg&w=640', 'ink'),
    (70, '다시 머물 자리', '지친 마음도 어딘가 내려앉을 자리를 고른다. 오늘은 생각만 해도 어깨가 풀리는 그 사람 곁에 조금 더 있고 싶다.', '내 마음은 노래하는 새 같다.
촉촉한 어린 가지에 둥지를 튼
새.', '크리스티나 로세티', '크리스티나 로세티 · 「생일」 1연 · 소로우 옮김', 'https://poets.org/poem/birthday/print', '가노 모토노부(전칭) · 〈봄 풍경 속 꽃과 새〉 · 클리블랜드 미술관 · CC0', 'https://www.clevelandart.org/art/1970.6.2', 'https://www.clevelandart.org/_next/image?q=75&url=https%3A%2F%2Fpiction.clevelandart.org%2Fcma%2Fump.di%3Fe%3D6B987DB9A0B19378095E351CF64C1D9CE7D432FC569B9A362C2B47B8831D23BC%26s%3D24247294%26se%3D399313166%26v%3D4%26f%3D1970.6.2_o5.jpg&w=640', 'ink')
), cards AS (
  SELECT *,
         concat_ws(E'\n', reflection, '', art_credit, art_source, quote_credit, quote_source) AS caption,
         1 + length(quotation) - length(replace(quotation, E'\n', '')) AS lines
  FROM entries
)
INSERT INTO feed_posts (id, author_id, title, text, bg, image, images, pages, created_at)
SELECT 'curation-' || n, 'sorow-curator', title, reflection, 0, image, ARRAY[image],
       jsonb_build_array(jsonb_build_object(
         'image', image, 'ratio', 0.5625, 'title', title, 'text', caption,
         'overlays', jsonb_build_array(
           jsonb_build_object('text', quotation, 'x', 0.5, 'y', 0.32, 'size', 0.048,
                              'color', ink, 'font', 'serif', 'align', 'center', 'style', 'plain'),
           jsonb_build_object('text', author, 'x', 0.5, 'y', 0.35 + lines * 0.021, 'size', 0.032,
                              'color', ink, 'font', 'serif', 'align', 'center', 'style', 'plain')
         )
       )),
       (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - (n - 21) * INTERVAL '4 hours'
FROM cards
ON CONFLICT (id) DO NOTHING;
