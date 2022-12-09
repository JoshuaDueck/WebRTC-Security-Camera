import React from 'react';
import { useState } from 'react';
import { doc, collection, onSnapshot, setDoc, addDoc } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useEffect } from 'react';

import '../App.css';
import { useRef } from 'react';

// The STUN server is used to help the browser figure out the best way to connect to the other peer.
// Google provides these for free.
const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ]
};

const CameraPage = () => {
    // State variables for the client key and the peer connection.
    const [clientKey, setClientKey] = useState('');
    const [pc, setPc] = useState(null);

    // Store the local stream for preview
    const localStream = useRef(null);
    const unsubscribeRef = useRef(null);

    // If the peer connection changes, handle the peer connection.
    useEffect(() => {
        if (pc) {
            handlePeerConnection();
        }
    }, [pc]);

    useEffect(() => {
        if (clientKey) {
            unsubscribeRef.current && unsubscribeRef.current();
            unsubscribeRef.current = onSnapshot(doc(firestore, 'clients', clientKey), (snapshot) => {
                if (snapshot.data() && snapshot.data().startOffer) {
                    handleIncomingSubmit();
                }
            });
        }
    }, [clientKey]);

    // Set up the client key based on local storage, or store it if none exists.
    useEffect(() => {
        let clientKey = localStorage.getItem('clientKey');
        if (!clientKey) {
            clientKey = generateClientKey();
            localStorage.setItem('clientKey', clientKey)
        }
        setClientKey(clientKey);
    }, []);

    // Handle the peer connection.
    const handlePeerConnection = async () => {
        let peerDocRef = await addDoc(collection(firestore, 'clients', clientKey, 'peers'), {}); // Create a new peer document for this peer on the client.

        console.log("Initiating peer connection.");

        // Get the user media, and add the track to the peer connection.
        navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
            },
            audio: {
                autoGainControl: false,
            },
            audio: false
        }).then((stream) => {
            console.log("Adding track");
            const video = document.getElementById('localVideo');
            video.srcObject = stream;
            pc.addTrack(stream.getTracks()[0], stream);
            console.log("Added track ", stream.getTracks()[0], " to stream ", stream);
        });

        // Add a transceiver for video, send only.
        pc.addTransceiver('video', { direction: 'sendonly' });

        // When an ICE candidate is added to the peer connection, send set it in the peer document.
        pc.onicecandidate = (event) => {
            console.log("Sending offer candidate: ", event.candidate);
            event.candidate && addDoc(collection(firestore, 'clients', clientKey, 'peers', peerDocRef.id, 'offerCandidates'), event.candidate.toJSON());
        };
        
        // Create an offer, and set it as the local description.
        let offerDescription = await pc.createOffer()
        pc.setLocalDescription(offerDescription);
        
        // Create a new offer object, and set the sdp and type.
        const offer = {
            sdp: offerDescription.sdp,
            type: offerDescription.type,
        };

        // If the client key is set, send the offer to the client through the shared document.
        if (clientKey) {
            // Put signal offer out.
            console.log("Putting signal offer out.");
            await setDoc(doc(firestore, 'clients', clientKey, 'peers', peerDocRef.id), { offer }); // Set the offer in the peer document.

            // Listen for an answer to the peer document for this peer.
            onSnapshot(doc(firestore, 'clients', clientKey, 'peers', peerDocRef.id), (snapshot) => {
                const data = snapshot.data();
                if (!pc.currentRemoteDescription && data?.answer) {
                    console.log("Handing answer: ", data.answer)
                    const answerDescription = new RTCSessionDescription(data.answer);
                    pc.setRemoteDescription(answerDescription);
                }
            });

            // Add a candidate to the peer connection when the answer candidate is created.
            onSnapshot(collection(firestore, 'clients', clientKey, 'peers', peerDocRef.id, 'answerCandidates'), (snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                        console.log("Adding answer candidate: ", change.doc.data());
                        const candidate = new RTCIceCandidate(change.doc.data());
                        pc.addIceCandidate(candidate);
                    }
                });
            });
        }
    }

    // Generates a random client key.
    const generateClientKey = () => {
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        let clientKey = '';
        for (let i = 0; i < 6; i++) {
            clientKey += chars[Math.floor(Math.random() * chars.length)];
        }
        return clientKey;
    };

    // Regenerates the client key.
    const regenerateClientKey = () => {
        let newClientKey = generateClientKey();
        localStorage.setItem('clientKey', newClientKey);
        setClientKey(newClientKey);
    }

    // Handle the form submission.
    const handleIncomingSubmit = async () => {
        localStream.current = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })

        setPc(new RTCPeerConnection(servers));
    };

    return (
        <>
            {!pc && (<div>
                <p>Client key: {clientKey ? (<><span>{clientKey}</span> <button onClick={() => regenerateClientKey()}>Regenerate</button></>) : <button onClick={() => generateClientKey()}>Generate</button>} </p>
            </div>)}
            <video id="localVideo" autoPlay playsInline controls={false} />
        </>
    );
};

export default CameraPage;
