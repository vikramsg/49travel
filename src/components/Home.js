import React from 'react';
import { Container, Row, Col, Card } from 'react-bootstrap';
import { Link } from 'react-router-dom';

const Home = () => {
    const cards = [
        {
            title: "Hamburg",
            text: "Find out all destinations you can reach from Hamburg using only your 49 Euro ticket.",
            link: "/origin/hamburg",
            clickable: true,
        },
        {
            title: "Berlin",
            text: "Find out all destinations you can reach from Berlin using only your 49 Euro ticket.",
            link: "/origin/berlin",
            clickable: true,
        },
        {
            title: "Munich",
            text: "Coming soon!",
            clickable: false,
        },
        {
            title: "Frankfurt",
            text: "Coming soon!",
            clickable: false,
        },
        {
            title: "Cologne",
            text: "Coming soon!",
            clickable: false,
        },
        {
            title: "Stuttgart",
            text: "Coming soon!",
            clickable: false,
        }
    ];

    return (
        <Container className="d-flex justify-content-center mt-4">
            <Row xs={1} md={2} lg={2} className="g-4">
                {cards.map((card, index) => (
                    <Col key={index}>
                        <Link
                            to={card.clickable === true ? card.link : '#'}
                            className={`text-decoration-none ${card.clickable === true ? 'card-clickable' : ''}`}
                        >
                            <Card className={`h-100 ${card.clickable ? 'card-clickable' : ''}`}>
                                <Card.Header><h5>{card.title}</h5></Card.Header>
                                <Card.Body>
                                    <Card.Text>{card.text}</Card.Text>
                                </Card.Body>
                            </Card>
                        </Link>
                    </Col>
                ))}
            </Row>
        </Container>
    );
};

export default Home;
