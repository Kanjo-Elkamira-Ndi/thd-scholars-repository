export interface InlineKeyboardButton {
  text: string;
  url: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}
