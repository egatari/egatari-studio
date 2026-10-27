### Security

- Player: slide-show commands sent with `postMessage` (`deck-cmd`, presenter tools) are accepted only from the presenter view the slide show opened, or, in the editor's preview, from the editor window that relays them. The current and next views inside the presenter view follow only the presenter view. Before this, any window or frame holding a reference to the slide show could move it
- Player: positions (`deck-pos`) are sent only to the presenter view and to the editor's preview window, never to another parent. A page that embeds the lesson with `embed=1` gets only the `position` events of Player P8
