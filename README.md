# idb-sync-prototype

Proof of concept web application implementation that demonstrates HTML5 IndexedDB synchronization with cloud services. The synchronization protocol is based on [1]. The application uses IndexedDB on the client for all data storage, with preemptive updates (updates are applied client-side before being validated with the server, and possibly rolled back at a later point in time if required). This design directly enables latency compensation and offline usage of the application.


This project is an extension of the Vanilla JavaScript TodoMVC Example by Oscar Godson: http://todomvc.com/vanilla-examples/vanillajs/


References:

[1] Luchin Doblies. "Master-Master Replication of HTML5 IndexedDB using Operators on Tree Updates". Master's Thesis, ETH Zurich, October 2013.
