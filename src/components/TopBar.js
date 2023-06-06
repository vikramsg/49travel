import { Nav, Navbar } from "react-bootstrap";

const TopBar = () => {
    const linkStyles = {
        color: '#f8f9fa', // Off white color
        fontWeight: 'bold'
    };

    return (
        <Navbar className="justify-content-between custom-navbar">
            <Nav>
                <Nav.Link href="/" style={linkStyles} className=" ms-4 me-3">Home</Nav.Link>
            </Nav>
            <Nav>
                <Nav.Link href="/about" style={linkStyles} className=" me-4 ms-3">About</Nav.Link>
            </Nav>
        </Navbar>
    );
};

export default TopBar;