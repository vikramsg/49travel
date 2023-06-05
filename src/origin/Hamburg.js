import React, { useEffect, useState, useRef } from 'react';
import { Container, Row, Col, Card } from 'react-bootstrap';
import { formatDuration, intervalToDuration } from 'date-fns';

import cardsData from '../data/hamburg_destinations.json';

const Hamburg = () => {
    const [cards, setCards] = useState([]);
    const expandedCardRef = useRef(null);

    useEffect(() => {
        setCards(cardsData.cards);

        const handleClickOutside = (event) => {
            if (expandedCardRef.current && !expandedCardRef.current.contains(event.target)) {
                setCards((prevCards) =>
                    prevCards.map((card) => ({ ...card, expanded: false }))
                );
            }
        };

        document.addEventListener('click', handleClickOutside);

        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, []);

    const handleCardClick = (city) => {
        setCards((prevCards) =>
            prevCards.map((card) =>
                card.city === city ? { ...card, expanded: true } : { ...card, expanded: false }
            )
        );
    };

    return (
        <Container className="d-flex justify-content-center mt-4">
            <Row xs={1} md={2} lg={2} className="g-4">
                {cards.map((card) => (
                    <Col key={card.city}>
                        <Card
                            ref={card.expanded ? expandedCardRef : null}
                            className={`h-100 card-clickable ${card.expanded ? 'expanded' : ''}`}
                            onClick={() => handleCardClick(card.city)}
                        >
                            <Card.Body>
                                <Card.Title>{card.city}</Card.Title>
                                {card.expanded ? (
                                    <div>
                                        <Card.Text>
                                            Journey time is {formatDuration(intervalToDuration({ start: 0, end: card.journey_time * 1000 }))}
                                        </Card.Text>
                                        <a href={card.url}>{"WikiVoyage"}</a>
                                        <Card.Text>{card.city_description}</Card.Text>
                                    </div>
                                ) : (
                                    <Card.Text>
                                        Journey time is {formatDuration(intervalToDuration({ start: 0, end: card.journey_time * 1000 }))}
                                    </Card.Text>
                                )}
                            </Card.Body>
                        </Card>
                    </Col>
                ))}
            </Row>
        </Container>
    );
};

export default Hamburg;