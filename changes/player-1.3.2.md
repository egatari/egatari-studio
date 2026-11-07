### Changed

- Egatari Player 1.3.2 (the bundled player that files carry): patch release. A participant joining a Live session sends the join code and the device id in the first message (`join`) instead of in the connection address, so they stay out of proxy and server logs (Live protocol, egatari/live). The Live server accepts both forms during the transition, so files exported with earlier players keep working
