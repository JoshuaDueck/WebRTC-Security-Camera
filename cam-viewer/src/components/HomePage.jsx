import React from 'react';
import { useState, useEffect } from 'react';
import { doc, collection, onSnapshot, updateDoc, addDoc, getDoc, setDoc } from 'firebase/firestore';
import { firestore } from '../firebase';

import '../App.css';
import { useRef } from 'react';

// The STUN server is used to help the browser figure out the best way to connect to the other peer.
// Google provides some STUN servers for free.
const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ]
};

const HomePage = () => {
    // The state variables for the client key and the numerous peer connections, as well as media streams.
    const [clientKey, setClientKey] = useState('');
    const [pcs, setPcs] = useState([]);
    const [mediaStreams, setMediaStreams] = useState([]);

    const unsubscribeRef = useRef(null); // Keeps track of the unsubscribe function for the peer collection.

    // Sets the media streams source objects to the incoming streams, based on index.
    useEffect(() => {
        mediaStreams.forEach((stream, index) => {
            const video = document.getElementById(`remoteVideo${index}`);
            if (video) {
                video.srcObject = stream;
            }
        });
    }, [mediaStreams]);

    // If the clientKey changes, set up a listener for the peer collection, to detect if any new peers have been added.
    useEffect(() => {
        if (clientKey) {
            unsubscribeRef.current && unsubscribeRef.current(); // Unsubscribe from the previous peer collection (client key).

            const peerCollectionRef = collection(firestore, 'clients', clientKey, 'peers'); // Get a reference to the peer collection.

            // This function is called whenever a new peer has been added with an offer.
            unsubscribeRef.current = onSnapshot(peerCollectionRef, (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    // If the peer has an offer, but no answer, then it is a new peer, so we can handle it.
                    if ((change.type === "modified" && change.doc.data().offer && !change.doc.data().answer)) {
                        handleNewPeer(change.doc.id)
                    }
                });
            });
            
            // Return the unsubscribe function for cleanup.
            return () => unsubscribeRef.current();
        }
    }, [clientKey]);

    // Handles a new peer, by creating a new peer connection, and setting up the necessary listeners.
    const handleNewPeer = async (from) => {
        const pc = new RTCPeerConnection(servers);
        
        pc.addTransceiver('video', { direction: 'recvonly' }); // Add a video transceiver, to receive video from the peer, but not send.

        // If an ice candidate is added, add it to the peer's answer candidates collection.
        pc.onicecandidate = (event) => {
            console.log("Got ice candidate: ", event.candidate);
            event.candidate && addDoc(collection(firestore, 'clients', clientKey, 'peers', from, 'answerCandidates'), event.candidate.toJSON());
        };

        // If a track is added, add it to the media streams state variable.
        pc.ontrack = (event) => {
            let newMediaStream = new MediaStream([event.track]);
            newMediaStream.onended = (event) => {
                console.log("Media stream ended: ", event);
                setMediaStreams(mediaStreams.filter((stream) => stream.id !== newMediaStream.id));
            }
            setMediaStreams(prevState => [...prevState, newMediaStream]);
        };

        // Get the peer's offer, and set it as the remote description.
        const offerDescription = (await getDoc(doc(firestore, 'clients', clientKey, 'peers', from))).data().offer;
        pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

        const answerDescription = await pc.createAnswer();
        await pc.setLocalDescription(answerDescription);

        const answer = {
            type: answerDescription.type,
            sdp: answerDescription.sdp,
        };

        updateDoc(doc(firestore, 'clients', clientKey, 'peers', from), { answer }); // Send the answer
        setPcs([...pcs, pc]);

        // Set up a listener for the peer's offer candidates collection, to detect if any new candidates have been added, and add those to the peer connection.
        onSnapshot(collection(firestore, 'clients', clientKey, 'peers', from, 'offerCandidates'), (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                console.log(change);
                if (change.type === 'added') {
                    console.log("Adding ice candidate: ", change.doc.data());
                    let data = change.doc.data();
                    pc.addIceCandidate(new RTCIceCandidate(data));
                }
            })
        });
    };

    const handleSubmit = () => {
        // We only want to start the offer once, so we set the flag, then set it to false to prevent repeated offers.
        setDoc(doc(firestore, 'clients', clientKey), { startOffer: true });
        setDoc(doc(firestore, 'clients', clientKey), { startOffer: false });
    };

    return (
        <div>
            <div>
                <h1>Camera Viewer</h1>
                <p>Enter the code for the monitoring client you would like to connect to.</p>
                <input type="text" value={clientKey} onChange={(e) => setClientKey(e.target.value)} />
                <button onClick={() => handleSubmit()}>Connect to client</button>
                {mediaStreams.map((stream, index) => {
                    return (
                        <React.Fragment key={stream.id}>
                            <p>Stream {index}</p>
                            <video
                                id={"remoteVideo"+index}
                                autoPlay
                                playsInline
                                muted
                                controls={false}
                            />
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

export default HomePage;