import React, { useState } from 'react';
import { Container, Row, Col, Card } from 'react-bootstrap';
import { formatDuration, intervalToDuration } from 'date-fns';

import cardsData from '../data/hamburg.json';

const Hamburg = () => {
    const [cards, setCards] = useState(cardsData.cities);

    const handleCardToggle = (index) => {
        setCards((prevCards) =>
            prevCards.map((card, i) => ({
                ...card,
                expanded: i === index ? !card.expanded : card.expanded
            }))
        );
    };

    return (
        <Container className="d-flex justify-content-center mt-4">
            <Row xs={1} md={2} lg={2} className="g-4">
                {cards.map((card, index) => (
                    <Col key={card.city}>
                        <Card>
                            <Card.Header><h5>{card.city}</h5></Card.Header>
                            <Card.Body>
                                <Card.Text>
                                    Journey time is {formatDuration(intervalToDuration({ start: 0, end: card.journey_time * 1000 }))}
                                </Card.Text>
                                {card.expanded && (
                                    <>
                                        <a href={card.url}>WikiVoyage</a>
                                        <Card.Text>{card.description}</Card.Text>
                                    </>
                                )}
                                <div
                                    className={`icon-wrapper ${card.expanded ? 'expanded' : ''}`}
                                    onClick={() => handleCardToggle(index)}
                                >
                                    {card.expanded ? (
                                        <i className="bi bi-caret-up-fill"></i>
                                    ) : (
                                        <i className="bi bi-caret-down-fill"></i>
                                    )}
                                </div>
                            </Card.Body>
                        </Card>
                    </Col>
                ))}
            </Row>
        </Container>
    );
};

export default Hamburg;