import React from 'react';
import { Container, Row, Col } from 'react-bootstrap';

const About = () => {
    return (
        <Container className="mt-4">
            <Row>
                <Col xs={12} md={8} lg={6} className="mx-auto">
                    <div style={{ textAlign: 'justify' }}>
                        <p>Hi I am Vikram. I had the idea of creating this website
                            when some friends and I were going to another city from Hamburg and we
                            started thinking about how to find all cities we could visit
                            with the new Deutschland ticket for 49 Euros.
                        </p>
                        <p>I plan to add new features and cities soon. Keep watching this space!
                            In the meantime you can reach me on{' '}
                            <a href="https://twitter.com/WhinerVikram">Twitter</a> or{' '}
                            <a href="https://www.linkedin.com/in/vikram-singh-phd/">Linkedin</a>.
                            I also have a <a href="https://vikramsg.github.io/Blog/">blog</a> where I write about some of the stuff I am working on,
                            including about how I built this site(coming soon).
                        </p>
                    </div>
                </Col>
            </Row>
        </Container>
    );
};

export default About;