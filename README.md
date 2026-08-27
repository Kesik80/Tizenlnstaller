# Tizenlnstaller

Репозиторий обслуживает [WgtInstaller](#wgtinstaller) — мою сборку Apps2Samsung
для установки Tizen-приложений на телевизоры Samsung.

Здесь лежат сами `.wgt` и два файла, которые приложение читает из сети при запуске.

## Что где

| Файл | Зачем |
|---|---|
| Релиз `v1.0.0` | Все `.wgt`. Приложение берёт список приложений из ассетов этого релиза |
| `third-party-apps-01.json` | Каталог: какие провайдеры показывать и откуда брать `.wgt` |
| `third-party-apps-info.md` | Описания приложений для экрана «App catalog» |

## Как добавить приложение

1. Открыть релиз `v1.0.0` → Edit release
2. Приложить `.wgt` файлом к этому же релизу
3. Дописать строку в таблицу в `third-party-apps-info.md`

Новый релиз создавать не нужно. Провайдер в `third-party-apps-01.json` закреплён
на теге `v1.0.0` — именно чтобы список не уезжал при появлении других релизов.

## third-party-apps-01.json

```json
{
  "schemaVersion": 2,
  "previewImages": {},
  "providers": [
    {
      "id": "kesik80-tizeninstaller",
      "url": "https://api.github.com/repos/Kesik80/Tizenlnstaller/releases/tags/v1.0.0",
      "prefix": "",
      "displayName": "Мои приложения",
      "take": 1,
      "expandAssets": true
    }
  ],
  "communityApps": []
}
```

`expandAssets: true` разворачивает каждый ассет релиза в отдельное приложение.
`take: 1` — сколько релизов брать. Провайдеров можно добавить сколько угодно,
но список в приложении сортируется по алфавиту целиком, группировки по провайдерам нет.

Правки подхватываются **всеми установленными сборками при следующем запуске**,
пересобирать APK не нужно. Перед коммитом стоит проверить:
`python3 -m json.tool third-party-apps-01.json`

## third-party-apps-info.md

Парсится только таблица. Нужны колонки `Application` и `Description`,
колонка `Version` необязательна. Таблица кончается на первой строке,
не начинающейся с `|`.

## WgtInstaller

Сборка [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung) (MIT, Patrick Stel)
с моей иконкой и каталогом из этого репозитория. Отличия от оригинала:

- каталог приложений и описания берутся отсюда, а не из апстрима
- секция Jellyfin builds на экране «App catalog» скрыта
- проверка обновлений отключена — APK обновляю вручную

Package остался `nl.madebypatrick.apps2samsung`, так что поверх официального
Apps2Samsung сборка не встанет и наоборот.

## Лицензия

`.wgt` в релизах принадлежат их авторам и выложены как есть.
Сам WgtInstaller — производная работа от Apps2Samsung под лицензией MIT.
