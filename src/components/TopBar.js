import { Nav, Navbar } from "react-bootstrap";
import { Github } from "react-bootstrap-icons";

const TopBar = () => {
    const linkStyles = {
        color: '#f8f9fa', // Off white color
        fontWeight: 'bold'
    };


    return (
        <Navbar className="justify-content-between custom-navbar">
            <Nav>
                <Nav.Link href="/" style={linkStyles} className="ms-4 me-3">
                    Home
                </Nav.Link>
            </Nav>
            <Nav className="d-flex align-items-center">
                <a
                    href="https://github.com/vikramsg/49travel"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white me-4"
                >
                    <Github size={20} className="me-1" />
                </a>
                <Nav.Link href="/about" style={linkStyles} className="me-4 ms-2">
                    About
                </Nav.Link>
            </Nav>
        </Navbar>
    );

};

export default TopBar;