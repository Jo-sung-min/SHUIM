// 생성 파일: frontend/scripts/fluent-icons/build.mjs 로 다시 만든다. 손으로 고치지 않는다.
// Microsoft Fluent UI System Icons (MIT) — https://github.com/microsoft/fluentui-system-icons/tree/4bf6b786b16f120595efcee8911c74392fa29c14
import type { FluentIconRow } from "./types";

export const FLUENT_SOURCE = { repo: "microsoft/fluentui-system-icons", commit: "4bf6b786b16f120595efcee8911c74392fa29c14" };
export type FluentCategoryId = "mind" | "people" | "food" | "play" | "move" | "nature" | "work" | "travel" | "life" | "symbol";
/** 아이콘 찾기의 분류 (picks.mjs 순서) */
export const FLUENT_CATEGORIES: { id: FluentCategoryId; label: string; count: number }[] = [
  { id: "mind", label: "마음", count: 22 },
  { id: "people", label: "사람", count: 25 },
  { id: "food", label: "음식", count: 18 },
  { id: "play", label: "취미", count: 26 },
  { id: "move", label: "운동·건강", count: 18 },
  { id: "nature", label: "자연·동물", count: 29 },
  { id: "work", label: "일·공부", count: 32 },
  { id: "travel", label: "여행·장소", count: 23 },
  { id: "life", label: "생활", count: 19 },
  { id: "symbol", label: "모양", count: 22 },
];
/** 분류별 아이콘 이름 (표시할 때 어느 조각을 받을지 찾는 데만 쓴다) */
export const FLUENT_NAMES: Record<FluentCategoryId, string> = {
  mind: "heart heart_broken heart_circle heart_pulse emoji emoji_smile_slight emoji_laugh emoji_sparkle emoji_sad emoji_sad_slight emoji_meh emoji_angry emoji_surprise emoji_hand drop sparkle lightbulb brain chat_multiple_heart person_heart home_heart board_heart",
  people: "people people_community people_team people_audience person person_walking person_support person_voice person_feedback person_chat person_lightbulb person_star person_home handshake hand_wave hand_left thumb_like chat chat_multiple comment mail send megaphone accessibility wheelchair_access",
  food: "food food_cake cookies food_toast food_egg food_apple food_carrot food_grains food_fish food_chicken_leg food_pizza bowl_chopsticks bowl_salad drink_coffee drink_to_go drink_beer drink_wine drink_margarita",
  play: "games puzzle_piece chess lottery music_note_1 music_note_2 headphones headphones_sound_wave guitar mic movies_and_tv filmstrip video_clip camera paint_brush color design_ideas pen book_open book library ticket_diagonal sticker balloon teddy glasses",
  move: "sport sport_soccer sport_basketball sport_baseball sport_american_football sport_hockey run dumbbell swimming_pool vehicle_bicycle trophy medal pulse pill stethoscope doctor briefcase_medical sleep",
  nature: "weather_sunny weather_sunny_low weather_moon weather_partly_cloudy_day weather_cloudy weather_rain weather_drizzle weather_thunderstorm weather_snowflake weather_snow weather_fog leaf_one leaf_two leaf_three tree_deciduous tree_evergreen plant_grass plant_cattail earth earth_leaf planet water fire animal_dog animal_cat animal_rabbit animal_turtle animal_paw_print bug",
  work: "briefcase laptop desktop code building building_shop building_factory building_government calculator calendar clock timer hourglass clipboard notebook note document backpack hat_graduation beaker ruler presenter whiteboard money savings wallet cart shopping_bag toolbox wrench vehicle_truck scales",
  travel: "airplane airplane_take_off luggage globe map location compass_northwest beach tent mountain_trail mountain_location_top building_lighthouse city home vehicle_car vehicle_bus vehicle_subway vehicle_ship vehicle_motorcycle vehicle_cable_car umbrella flag ticket_horizontal",
  life: "bed broom washer tv phone key door window gift gift_open box archive alert clock_alarm battery_charge battery_1 lightbulb_filament calendar_clock receipt",
  symbol: "star star_emphasis crown diamond ribbon ribbon_star bookmark tag shield lock_closed flash rocket target wand pin eye cube puzzle_cube circle square triangle mention",
};
/** 분류 조각을 따로따로 받는다 (번들러가 분류마다 청크를 나눈다) */
export function importFluentCategory(id: FluentCategoryId): Promise<{ default: FluentIconRow[] }> {
  switch (id) {
    case "mind": return import("./data/mind");
    case "people": return import("./data/people");
    case "food": return import("./data/food");
    case "play": return import("./data/play");
    case "move": return import("./data/move");
    case "nature": return import("./data/nature");
    case "work": return import("./data/work");
    case "travel": return import("./data/travel");
    case "life": return import("./data/life");
    case "symbol": return import("./data/symbol");
  }
}
