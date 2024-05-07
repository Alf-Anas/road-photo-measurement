import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import proj4 from "proj4";
import {
    scale,
    rotate,
    translate,
    compose,
    applyToPoint,
    fromTriangles,
} from "transformation-matrix";
import GridGeojson from "../Data/grid.geojson";
import { Alert, Button, ButtonGroup, Col, Form, InputGroup, Row } from "react-bootstrap";

proj4.defs([
    [
        "EPSG:4326",
        "+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees",
    ],
    [
        "EPSG:3857",
        "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs",
    ],
    [
        "EPSG:3857:LOCAL",
        "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs",
    ],
]);

const initialTrainingData = {
    x1: null,
    y1: null,
    x2: null,
    y2: null,
    lon1: null,
    lat1: null,
    lon2: null,
    lat2: null,
    length: 0,
    realLength: 0,
};

const initialDrawLine = {
    draw: false,
    index: null,
    x1: null,
    y1: null,
    x2: null,
    y2: null,
    length: 0,
};

export default function Home() {
    const map = useRef(null);
    const imageOverlay = useRef(null);
    const drawLineLayer = useRef(null);
    const [fotoFile, setFotoFile] = useState({ name: "", file: "", objURL: "", properties: {} });
    const [trainingData, setTrainingData] = useState([{ ...initialTrainingData }]);
    const [drawLine, setDrawLine] = useState({ ...initialDrawLine });
    const [mapClick, setMapClick] = useState({ lat: 0, lon: 0 });

    useEffect(() => {}, []);

    useEffect(() => {
        if (map.current) return; // initialize map only once
        map.current = L.map("map", {
            center: [0, 0],
            zoom: 15,
            minZoom: 10,
        });

        map.current.on("click", (e) => {
            const coord = e.latlng;
            setMapClick({ lat: coord.lat, lon: coord.lng });
        });

        async function loadLayer() {
            fetch(GridGeojson)
                .then((out) => out.json())
                .then((json) => {
                    L.geoJSON(json, {
                        style: () => {
                            return { color: "white", weight: 0.5, opacity: 0.25 };
                        },
                    }).addTo(map.current);
                })
                .catch((err) => {
                    console.log(err);
                });
        }
        loadLayer();

        L.circle([0, 0], { radius: 2 }).addTo(map.current);
    }, []);

    function onFileChange(e) {
        const files = e.target.files;
        if (files.length > 0) {
            const namaFile = files[0].name;
            const imgFiles = files[0];
            const imgObjURL = URL.createObjectURL(imgFiles);

            const img = new Image();
            img.onload = () => {
                setFotoFile({ nama: namaFile, file: imgFiles, objURL: imgObjURL, properties: img });
            };
            img.src = imgObjURL;
        }
    }

    useEffect(() => {
        if (!fotoFile?.objURL || !map?.current) return;
        const imgWidth = fotoFile?.properties?.width;
        const imgHeight = fotoFile?.properties?.height;
        const imgLonLat = proj4("EPSG:3857", "EPSG:4326", [imgWidth / 2, imgHeight / 2]);
        const imageBounds = [
            [-imgLonLat[1], -imgLonLat[0]],
            [imgLonLat[1], imgLonLat[0]],
        ];
        if (imageOverlay.current) {
            map.current.removeLayer(imageOverlay.current);
        }
        imageOverlay.current = L.imageOverlay(fotoFile?.objURL, imageBounds);
        imageOverlay.current.addTo(map.current);
    }, [fotoFile]);

    useEffect(() => {
        if (drawLineLayer.current) {
            map.current.removeLayer(drawLineLayer.current);
        }
        const lineArray = [];
        trainingData.forEach((item) => {
            if (item?.lon1 && item?.lon2) {
                lineArray.push([
                    [item?.lat1, item?.lon1],
                    [item?.lat2, item?.lon2],
                ]);
            }
        });
        drawLineLayer.current = L.polyline(lineArray, { color: "red" });
        drawLineLayer.current.addTo(map.current);
    }, [trainingData]);

    useEffect(() => {
        if (!drawLine?.draw) {
            map.current.getContainer().style.cursor = "";
            return;
        }
        map.current.getContainer().style.cursor = "crosshair";
    }, [drawLine]);

    useEffect(() => {
        setDrawLine((oldState) => {
            if (!oldState?.x1) {
                return { ...oldState, x1: mapClick?.lon, y1: mapClick?.lat };
            } else {
                const imgXY1 = proj4("EPSG:4326", "EPSG:3857", [oldState?.x1, oldState?.y1]);
                const imgXY2 = proj4("EPSG:4326", "EPSG:3857", [mapClick?.lon, mapClick?.lat]);
                const distance = Math.sqrt(
                    Math.pow(imgXY2[0] - imgXY1[0], 2) + Math.pow(imgXY2[1] - imgXY1[1], 2)
                );
                setTrainingData((oldSt) => {
                    oldSt[oldState?.index] = {
                        ...oldSt[oldState?.index],
                        x1: imgXY1[0],
                        y1: imgXY1[1],
                        x2: imgXY2[0],
                        y2: imgXY2[1],
                        lon1: oldState?.x1,
                        lat1: oldState?.y1,
                        lon2: mapClick?.lon,
                        lat2: mapClick?.lat,
                        length: distance,
                    };
                    return [...oldSt];
                });
                return { ...initialTrainingData, draw: false };
            }
        });
    }, [mapClick]);

    function calculateParameter() {
        const triangleA = [
            { x: -455.54589157625054, y: -778.5529345849235 },
            { x: -536.9429997078923, y: -994.8756962745964 },
            { x: -88.11157587464409, y: -977.6773630877243 },
            // { x: -453.55348808424617, y: -770.9390899699812 },
            // { x: -92.73821203151792, y: -758.3986400167173 },
            // { x: -103.4198433852686, y: -624.7308796574081 },
        ];
        const triangleB = [
            { x: 0, y: 1000 },
            { x: 0, y: 0 },
            { x: 1000, y: 0 },
        ];
        const matr = fromTriangles(triangleA, triangleB);
        console.log(matr);
        const app1 = applyToPoint(matr, { x: -455.5814575224878, y: -777.9856280590587 });
        const app2 = applyToPoint(matr, { x: -94.37630060672315, y: -766.9978066102224 });
        // const app1 = applyToPoint(matr, { x: -103.5477208066477, y: -624.2158262020158 });
        // const app2 = applyToPoint(matr, { x: -405.1844543737959, y: -629.2917226134267 });
        // const app1 = applyToPoint(matr, { x: -92.73821203151792, y: -758.3986400167173 });
        // const app2 = applyToPoint(matr, { x: -103.4198433852686, y: -624.7308796574081 });
        // const app1 = applyToPoint(matr, { x: -453.55348808424617, y: -770.9390899699812 });
        // const app2 = applyToPoint(matr, { x: -92.73821203151792, y: -758.3986400167173 });
        console.log(app1);
        console.log(app2);
        const distance = Math.sqrt(Math.pow(app2.x - app1.x, 2) + Math.pow(app2.y - app1.y, 2));
        console.log(distance);
    }

    return (
        <div style={{ width: "100%", textAlign: "center", backgroundColor: "#eee" }}>
            <div
                style={{
                    maxWidth: "85%",
                    margin: "0 auto",
                    padding: "2rem 0",
                    backgroundColor: "white",
                    minHeight: "100vh",
                    textAlign: "start",
                }}
            >
                <Row style={{ padding: "1rem" }}>
                    <Col sm={12} md={8} lg={8}>
                        <div
                            id="map"
                            style={{
                                width: "100%",
                                zIndex: "10",
                                height: "500px",
                            }}
                        />
                    </Col>
                    <Col sm={12} md={4} lg={4}>
                        <Form.Group controlId="choose-photo" className="mb-3">
                            <Form.Label>Pilih Foto</Form.Label>
                            <Form.Control
                                type="file"
                                size="sm"
                                accept="image/*"
                                onChange={onFileChange}
                            />
                            {fotoFile?.properties?.width && (
                                <Alert variant="info">
                                    {"Ukuran Foto : " +
                                        fotoFile?.properties?.width +
                                        " x " +
                                        fotoFile?.properties?.height +
                                        " pixel"}
                                </Alert>
                            )}
                        </Form.Group>
                        <p>Data Training</p>
                        {trainingData.map((item, idx) => {
                            return (
                                <React.Fragment key={idx}>
                                    <Alert variant="warning" className="mb-0">
                                        X1 = {item?.x1}
                                        <br />
                                        Y1 = {item?.y1}
                                        <br />
                                        X2 = {item?.x2}
                                        <br />
                                        Y2 = {item?.y2}
                                    </Alert>
                                    <ButtonGroup size="sm" className="mb-3 w-100">
                                        <Button
                                            variant="warning"
                                            onClick={() => {
                                                if (drawLine?.draw && drawLine?.index === idx) {
                                                    setDrawLine({
                                                        ...initialDrawLine,
                                                        index: "",
                                                        draw: false,
                                                    });
                                                } else {
                                                    setDrawLine({
                                                        ...initialDrawLine,
                                                        index: idx,
                                                        draw: true,
                                                    });
                                                }
                                            }}
                                        >
                                            {drawLine?.draw && drawLine?.index === idx
                                                ? "Batal"
                                                : "Gambar Garis"}
                                        </Button>
                                        <Button
                                            variant="outline-danger"
                                            onClick={() => {
                                                setTrainingData((oldState) => {
                                                    oldState.splice(idx, 1);
                                                    return [...oldState];
                                                });
                                            }}
                                        >
                                            Hapus Data
                                        </Button>
                                    </ButtonGroup>
                                    <InputGroup className="mb-3">
                                        <InputGroup.Text>
                                            D = {item?.length?.toFixed(3)}
                                        </InputGroup.Text>
                                        <Form.Control
                                            placeholder="Input Ukuran Sebenarnya"
                                            value={item?.realLength}
                                            onChange={(e) => {
                                                trainingData[idx].realLength = e.target.value;
                                                setTrainingData([...trainingData]);
                                            }}
                                        />
                                    </InputGroup>
                                </React.Fragment>
                            );
                        })}
                        <Button
                            variant="outline-primary w-100 mb-3"
                            onClick={() =>
                                setTrainingData((oldState) => [
                                    ...oldState,
                                    { ...initialTrainingData },
                                ])
                            }
                        >
                            Tambah Data Training
                        </Button>
                        <Button variant="outline-success w-100 mb-3" onClick={calculateParameter}>
                            Hitung Parameter
                        </Button>
                        {/* <ButtonGroup size="sm">
                            <Button variant="outline-primary">Test</Button>
                            <Button variant="outline-warning">Test</Button>
                            <Button variant="outline-danger">Test</Button>
                        </ButtonGroup> */}
                    </Col>
                </Row>
            </div>
        </div>
    );
}
