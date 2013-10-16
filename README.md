# idb-sync-prototype

Proof of concept web application implementation that demonstrates HTML5 IndexedDB synchronization with cloud services. The synchronization protocol is based on my Master Thesis  ETH Zurich (March - October 2013). 

The application uses IndexedDB on the client for all data storage, with preemptive updates (updates are applied client-side before being validated with the server, and possibly rolled back at a later point in time if required). This design directly enables latency compensation and offline usage of the application.

An extension of the Vanilla JavaScript TodoMVC Example by Oscar Godson: http://todomvc.com/vanilla-examples/vanillajs/
